# Simple Image to WebP Converter

A simple web application for converting images (PNG, JPG, GIF) to the WebP format. It's built with Node.js and containerized with Docker, designed to be run behind a reverse proxy.

## Features

  * **Single or Batch Uploads:** Convert one image or many images at once.
  * **ZIP Downloads:** Multiple files are automatically bundled into a single `.zip` archive.
  * **Conversion Options:**
      * **Quality:** Set a lossy quality level from 0 to 100.
      * **Lossless:** Optionally convert with no quality loss.
      * **Resize:** Set a max width and/or max height to resize images.
      * **Effort:** Adjust the conversion speed vs. file size (0=Fastest, 4=Best).
  * **Custom Filename:** Set a custom output name for single file conversions.

## Tech Stack

  * **Backend:** Node.js, Express
  * **File Handling:** Multer (uploads), Archiver (zipping)
  * **Conversion:** `cwebp` command-line tool
  * **Containerization:** Docker & Docker Compose

## Requirements

  * Docker
  * Docker Compose

## How to Run

1.  Clone the repository:

    ```bash
    git clone https://github.com/Sam-Vrgl/webp-converter.git
    cd webp-converter
    ```

2.  Build and run the container in detached mode:

    ```bash
    docker-compose up --build -d
    ```

3.  The application will be running on `http://localhost:3000`.

### Production Deployment

For production, run this app behind a reverse proxy like Nginx. You must configure the proxy to allow large file uploads and set a long enough timeout for image conversions.

**Example Nginx directives:**

```nginx
server {
    # ... your server config ...
    
    client_max_body_size 50M;
    proxy_connect_timeout 300s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;

    location / {
        proxy_pass http://localhost:3000;
        # ... your proxy headers ...
    }
}
```