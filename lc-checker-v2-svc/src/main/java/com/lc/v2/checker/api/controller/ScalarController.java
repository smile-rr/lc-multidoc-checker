package com.lc.v2.checker.api.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves Scalar API reference UI at GET /docs.
 * Loads @scalar/api-reference from CDN and points it at the OpenAPI spec (/v3/api-docs).
 */
@RestController
public class ScalarController {

    @GetMapping(value = "/docs", produces = MediaType.TEXT_HTML_VALUE)
    public String scalar() {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <title>LC Checker v2 — API Reference</title>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <style>body { margin: 0; }</style>
                </head>
                <body>
                  <script
                    id="api-reference"
                    data-url="/v3/api-docs"
                    data-configuration='{"theme":"default","layout":"modern"}'
                  ></script>
                  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
                </body>
                </html>
                """;
    }
}
