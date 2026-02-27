"""Error handler registrations."""

from __future__ import annotations

from flask import Flask, render_template, request


def register_error_handlers(app: Flask) -> None:
    """Register common HTTP error handlers."""

    @app.errorhandler(400)
    def handle_bad_request(error):
        app.logger.warning("[HTTP 400] path=%s error=%s", request.path, error)
        return (
            render_template(
                "error.html",
                title="Bad Request",
                message="The request could not be processed. Please check your inputs.",
            ),
            400,
        )

    @app.errorhandler(404)
    def handle_not_found(error):
        app.logger.warning("[HTTP 404] path=%s error=%s", request.path, error)
        return (
            render_template(
                "error.html",
                title="Page Not Found",
                message="We could not find that page.",
            ),
            404,
        )

    @app.errorhandler(413)
    def handle_too_large(error):
        app.logger.warning("[HTTP 413] path=%s error=%s", request.path, error)
        return (
            render_template(
                "error.html",
                title="Upload Too Large",
                message="Uploaded file is too large. Please select smaller CSV files.",
            ),
            413,
        )

    @app.errorhandler(500)
    def handle_server_error(error):
        app.logger.exception("[HTTP 500] path=%s error=%s", request.path, error)
        return (
            render_template(
                "error.html",
                title="Server Error",
                message="Something went wrong. Please try again.",
            ),
            500,
        )
