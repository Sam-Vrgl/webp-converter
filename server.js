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

/**
 * Builds the argument array for cwebp based on user options.
 * @param {object} options - The conversion options from req.body.
 * @param {string} inputPath - Path to the input file.
 * @param {string} outputPath - Path for the output file.
 * @returns {string[]} An array of arguments for execFile.
 */
const buildCwebpArgs = (options, inputPath, outputPath) => {
    const { quality, lossless, effort, maxWidth, maxHeight } = options;
    const cwebpArgs = [];

    if (lossless === 'true') {
        cwebpArgs.push('-lossless');
    } else {
        let q = parseInt(quality, 10);
        if (isNaN(q) || q < 0 || q > 100) {
            q = 80;
        }
        cwebpArgs.push('-q', q.toString());
    }

    let m = parseInt(effort, 10);
    if (!isNaN(m) && m >= 0 && m < 4) {
        cwebpArgs.push('-m', m.toString());
    }

    const w = parseInt(maxWidth, 10);
    const h = parseInt(maxHeight, 10);

    if (!isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
        cwebpArgs.push('-resize', w.toString(), h.toString());
    } else if (!isNaN(w) && w > 0) {
        cwebpArgs.push('-resize', w.toString(), '0');
    } else if (!isNaN(h) && h > 0) {
        cwebpArgs.push('-resize', '0', h.toString());
    }

    cwebpArgs.push(inputPath, '-o', outputPath);

    return cwebpArgs;
};


app.post('/convert', upload, (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded.');
    }

    if (req.files.length === 1) {
        const file = req.files[0];
        const inputPath = file.path;

        const originalBaseName = path.basename(file.originalname, path.extname(file.originalname));
        let desiredName = req.body.filename;
        let finalDownloadName;

        if (desiredName) {
            finalDownloadName = desiredName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-]/g, '_') + '.webp';
        } else {
            finalDownloadName = `${originalBaseName}.webp`;
        }

        const uniqueInputBase = path.basename(file.filename, path.extname(file.filename));
        const uniqueOutputFilename = `${uniqueInputBase}.webp`;
        const outputPath = path.join(uploadsDir, uniqueOutputFilename);

        const cwebpArgs = buildCwebpArgs(req.body, inputPath, outputPath);
        // console.log('cwebp args:', cwebpArgs.join(' ')); // For debugging

        execFile('cwebp', cwebpArgs, (error, stdout, stderr) => {
            if (error) {
                console.error(`cwebp error: ${stderr}`);
                cleanupFiles([inputPath]);
                return res.status(500).send('Conversion failed.');
            }

            res.download(outputPath, finalDownloadName, (downloadErr) => {
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
                const outputZipName = `${originalBaseName}.webp`;

                const uniqueInputBase = path.basename(file.filename, path.extname(file.filename));
                const uniqueOutputFilename = `${uniqueInputBase}.webp`;
                const outputPath = path.join(uploadsDir, uniqueOutputFilename);

                const cwebpArgs = buildCwebpArgs(req.body, inputPath, outputPath);
                // console.log('cwebp args:', cwebpArgs.join(' ')); // For debugging

                execFile('cwebp', cwebpArgs, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`cwebp error for ${file.originalname}: ${stderr}`);
                        return reject(new Error(`Failed to convert ${file.originalname}`));
                    }

                    outputFiles.push(outputPath);
                    resolve({ path: outputPath, name: outputZipName });
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