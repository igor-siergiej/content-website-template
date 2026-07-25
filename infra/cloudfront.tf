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

# /keystatic is a directory, not an object, so it would hit the SPA 403/404 fallback below
# and render the site instead of the CMS. Rewrite it to the real entry point. Also rewrites
# the Cloud-mode OAuth callback path, which is a fixed URL the browser is redirected to
# directly and would otherwise 404.
#
# Also gates the site by hostname: while hidden, the domain aliases 403 but the raw
# *.cloudfront.net URL keeps working, since disabling the whole distribution would take
# both down. Flip DOMAIN_HIDDEN to false to restore the domain.
resource "aws_cloudfront_function" "keystatic_index" {
  name    = "${var.project}-keystatic-index"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    var DOMAIN_HIDDEN = true;
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

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class
  comment             = var.project
  aliases             = [var.domain_name, "www.${var.domain_name}"]

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
  }

  # SPA fallback: unknown paths serve index.html.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
