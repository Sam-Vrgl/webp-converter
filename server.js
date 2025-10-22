const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Create 'uploads' directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Use originalname + timestamp to avoid conflicts
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Serve static files (index.html, robots.txt)
app.use(express.static(path.join(__dirname, 'public')));

// Conversion endpoint
app.post('/convert', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // --- NEW FEATURES ---

  // 1. Get and validate quality
  let quality = parseInt(req.body.quality, 10);
  if (isNaN(quality) || quality < 0 || quality > 100) {
    quality = 80; // Default quality
  }

  // 2. Get and sanitize filename
  const originalBaseName = path.basename(req.file.filename, path.extname(req.file.filename));
  let desiredName = req.body.filename;
  let outputBaseName;

  if (desiredName) {
    // Remove any potential extension and sanitize
    outputBaseName = desiredName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
  
  // If the desired name is empty or was only invalid chars, fall back to original
  if (!outputBaseName) {
    outputBaseName = originalBaseName;
  }

  const outputFilename = `${outputBaseName}.webp`;
  const inputPath = req.file.path;
  const outputPath = path.join(uploadsDir, outputFilename);

  // --- END NEW FEATURES ---

  // Run the cwebp command with the new quality setting
  const cwebpArgs = ['-q', quality.toString(), inputPath, '-o', outputPath];

  execFile('cwebp', cwebpArgs, (error, stdout, stderr) => {
    if (error) {
      console.error(`cwebp error: ${stderr}`);
      // Clean up input file
      fs.unlink(inputPath, (unlinkErr) => {
        if (unlinkErr) console.error(`Error deleting input file: ${unlinkErr.message}`);
      });
      return res.status(500).send('Conversion failed.');
    }

    // Send the converted file for download with the new filename
    res.download(outputPath, outputFilename, (downloadErr) => {
      // Clean up both input and output files after download
      fs.unlink(inputPath, (unlinkErr) => {
        if (unlinkErr) console.error(`Error deleting input file: ${unlinkErr.message}`);
      });
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) console.error(`Error deleting output file: ${unlinkErr.message}`);
      });

      if (downloadErr) {
        console.error(`Download error: ${downloadErr.message}`);
      }
    });
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

