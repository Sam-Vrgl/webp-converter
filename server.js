const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const port = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage }).array('image', 20);

app.use(express.static(path.join(__dirname, 'public')));

const cleanupFiles = (files) => {
  files.forEach(filepath => {
    if (filepath) {
      fs.unlink(filepath, (err) => {
        if (err) console.error(`Error deleting file: ${filepath}`, err.message);
      });
    }
  });
};

app.post('/convert', upload, (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  let quality = parseInt(req.body.quality, 10);
  if (isNaN(quality) || quality < 0 || quality > 100) {
    quality = 80;
  }

  if (req.files.length === 1) {
    const file = req.files[0];
    
    const originalBaseName = path.basename(file.filename, path.extname(file.filename));
    let desiredName = req.body.filename;
    let outputBaseName;

    if (desiredName) {
      outputBaseName = desiredName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-]/g, '_');
    }
    
    if (!outputBaseName) {
      outputBaseName = originalBaseName;
    }

    const outputFilename = `${outputBaseName}.webp`;
    const inputPath = file.path;
    const outputPath = path.join(uploadsDir, outputFilename);

    const cwebpArgs = ['-q', quality.toString(), inputPath, '-o', outputPath];
    
    execFile('cwebp', cwebpArgs, (error, stdout, stderr) => {
      if (error) {
        console.error(`cwebp error: ${stderr}`);
        cleanupFiles([inputPath]);
        return res.status(500).send('Conversion failed.');
      }

      res.download(outputPath, outputFilename, (downloadErr) => {
        cleanupFiles([inputPath, outputPath]);
        
        if (downloadErr) {
          console.error(`Download error: ${downloadErr.message}`);
        }
      });
    });

  } else {
    const outputFiles = [];
    const inputFiles = [];
    
    const conversionPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const inputPath = file.path;
        inputFiles.push(inputPath);

        const originalBaseName = path.basename(file.originalname, path.extname(file.originalname));
        const outputFilename = `${originalBaseName}.webp`;
        const outputPath = path.join(uploadsDir, outputFilename);

        const cwebpArgs = ['-q', quality.toString(), inputPath, '-o', outputPath];
        
        execFile('cwebp', cwebpArgs, (error, stdout, stderr) => {
          if (error) {
            console.error(`cwebp error for ${file.originalname}: ${stderr}`);
            return reject(new Error(`Failed to convert ${file.originalname}`));
          }

          outputFiles.push(outputPath);
          resolve({ path: outputPath, name: outputFilename });
        });
      });
    });

    Promise.all(conversionPromises)
      .then(convertedFiles => {
        const zip = archiver('zip');
        const zipFilename = 'converted-images.webp.zip';
        
        res.attachment(zipFilename);
        zip.pipe(res);

        convertedFiles.forEach(file => {
          zip.file(file.path, { name: file.name });
        });

        zip.finalize();

        zip.on('end', () => {
          cleanupFiles(inputFiles.concat(outputFiles));
        });

      })
      .catch(error => {
        console.error('Batch conversion failed:', error.message);
        cleanupFiles(inputFiles.concat(outputFiles));
        res.status(500).send(`One or more conversions failed. ${error.message}`);
      });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});