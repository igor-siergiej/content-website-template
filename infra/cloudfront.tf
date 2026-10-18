resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.project}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}


resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "${var.project}-security-headers"

  security_headers_config {
    content_type_options {
      override = true
    }

    # SAMEORIGIN, not DENY: the Keystatic admin at /keystatic embeds the site in an
    # iframe for live preview. Cross-origin framing is still blocked.
    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    xss_protection {
      protection = true
      mode_block = true
      override   = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000 # 2 years
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

# /keystatic is a directory, not an object, so it would hit the 403/404 fallback below and
# render the 404 page instead of the CMS. Rewrite it to the real entry point. Also rewrites
# the Cloud-mode OAuth callback path, which is a fixed URL the browser is redirected to
# directly and would otherwise 404.
#
# Also gates the site by hostname: while hidden, the domain aliases 403 but the raw
# *.cloudfront.net URL keeps working, since disabling the whole distribution would take
# both down. var.domain_hidden defaults to false — flip it to true only while
# deliberately holding a domain back pre-launch (see infra/README.md).
#
# Runs before site_dir_rewrite below: the special-case paths (e.g. /keystatic/cloud/oauth/
# callback) must rewrite to their exact target, not be re-chewed by the general directory
# rule on the way out.
resource "aws_cloudfront_function" "keystatic_index" {
  name    = "${var.project}-keystatic-index"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    var DOMAIN_HIDDEN = ${var.domain_hidden};
    var HIDDEN_HOSTS = ['${var.domain_name}', 'www.${var.domain_name}'];

    function handler(event) {
        var request = event.request;
        if (DOMAIN_HIDDEN && HIDDEN_HOSTS.includes(request.headers.host.value)) {
            return { statusCode: 403, statusDescription: 'Forbidden' };
        }
        if (
            request.uri === '/keystatic' ||
            request.uri === '/keystatic/' ||
            request.uri === '/keystatic/cloud/oauth/callback'
        ) {
            request.uri = '/keystatic/index.html';
        }
        return request;
    }
  JS
}

# Astro builds directory-format output: `/about` is the object `about/index.html`,
# `/projects/shoppingo` is `projects/shoppingo/index.html`. CloudFront's default S3 REST
# origin doesn't resolve directory indexes (default_root_object only covers `/`), so a
# request for `/about` would otherwise ask S3 for the key `about`, the OAC-only bucket
# policy answers 403, and custom_error_response below serves /404.html. Every route on
# the site except `/` and the handful of real files at the root (/rss.xml, /robots.txt,
# /sitemap*.xml, the content-hashed `/_astro/*` assets) would render the 404 page.
#
# Logic lives in cloudfront-function.js so it's reviewable as a real file (syntax
# highlighting, diff-friendly, no heredoc string-escaping surprises).
resource "aws_cloudfront_function" "site_dir_rewrite" {
  name    = "${var.project}-site-dir-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/cloudfront-function.js")
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class
  comment             = var.project
  aliases             = local.has_domain ? [var.domain_name, "www.${var.domain_name}"] : []

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Managed-CachingOptimized. Per-object Cache-Control set on upload.
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.keystatic_index.arn
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.site_dir_rewrite.arn
    }
  }

  # This is a static multi-page site, not a client-routed SPA: an unknown path is a real
  # 404, not a client-side route to hand to index.html. The private bucket's OAC-only
  # policy also means a genuinely missing key comes back from S3 as 403 (no s3:ListBucket
  # to distinguish "denied" from "not found"), so both codes route to the same 404 page.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # No domain yet: fall back to CloudFront's default *.cloudfront.net certificate — an
  # ACM cert can't be issued or validated without a domain to put DNS records on. Once
  # var.domain_name is set, this switches to the ACM cert instead.
  viewer_certificate {
    cloudfront_default_certificate = local.has_domain ? null : true
    acm_certificate_arn            = local.has_domain ? aws_acm_certificate_validation.site[0].certificate_arn : null
    ssl_support_method             = local.has_domain ? "sni-only" : null
    minimum_protocol_version       = local.has_domain ? "TLSv1.2_2021" : null
  }
}
