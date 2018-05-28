const fs = require('fs');
const util = require('util');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

const BaseApplication = require('./BaseApplication');
const File = require('./File');
const Directory = require('./Directory');

class Thumbnails extends BaseApplication {
	constructor(options, progressCallback, cache) {
		super(options, progressCallback);

		this.cache = cache;

		this.generate = this.generate.bind(this);
	}

	generate(files) {
		return new Promise((resolve, reject) => {
			this.prepareThumbDir();

			this.runTasks(this.populateTasks(files), () => {
				resolve(files);
			});
		});
	}

	populateTasks(files) {
		let tasks = [];

		files.forEach((file) => {
			if (file instanceof File) {
				switch (file.mimeType) {
					case 'image/jpeg':
					case 'image/png':
						tasks.push(() => {
							return this.generateImageThumbnail(
								file,
								this.options.thumbsDir + path.sep +
									file.hash + file.extension
							).then((thumbnailFilename) => {
								file.thumbnailFilename = thumbnailFilename;
								this.cache.add(file);
							});
						});
						break;

					case 'video/mp4':
					case 'video/quicktime':
					case 'video/ogg':
					case 'video/webm':
						tasks.push(() => {
							return this.generateVideoThumbnail(
								file,
								this.options.thumbsDir
							).then((thumbnailFilename) => {
								file.thumbnailFilename = thumbnailFilename;
								this.cache.add(file, 'thumb', true);
							})
						});
						break;

					default:
						this.writeError(`Format ${file.mimeType} not supported. Thumb for ${file.filename} not generated.`);



				}
			} else if (file instanceof Directory) {
				tasks = tasks.concat(
					this.populateTasks(file.children)
				);
			}
		});

		return tasks;
	}

	runTasks(tasks, callback) {
		if (tasks.length) {
			return tasks.shift().apply(this)
				.then(() => this.runTasks(tasks, callback));
		}

		return callback.apply(this);
	}

	prepareThumbDir() {
		// Attempt to create thumbs directory
		try {
			if (!fs.existsSync(this.options.thumbsDir)) {
				fs.mkdirSync(this.options.thumbsDir);
			}
		} catch (e) {
			this.writeError(`Could not create output directory: ${e.message}`);
		}
	}

	generateImageThumbnail(file, outputFile) {
		return new Promise((resolve, reject) => {
			if (!(file instanceof File)) {
				reject('file is not an instance of File');
			}

			if (
				this.cache.cachedWithProp(file, 'thumb', true) &&
				fs.existsSync(outputFile)
			) {
				// Cache exists (and is newer) and the file exists
				return resolve(outputFile);
			}

			this.setProgress('Creating image thumbnail', file);

			sharp(file.filename)
				.resize(this.options.width, this.options.height)
				.max()
				.toFile(outputFile)
				.then(() => resolve(outputFile));
		});
	}

	generateVideoThumbnail(file, outputDir) {
		return new Promise((resolve, reject) => {
			let outputFile = this.options.thumbsDir + path.sep + file.hash + '.jpg';

			if (
				this.cache.cached(file, 'thumb', true) &&
				fs.existsSync(outputFile)
			) {
				// Cache exists (and is newer) and the file exists
				return resolve(outputFile);
			}

			this.setProgress('Creating video thumbnail', file);

			ffmpeg(file.filename)
				.on('end', function() {
					resolve(outputFile);
				})
				.on('error', function(err, stdout, stderr) {
					this.writeError('Cannot process video: ' + err.message);
				})
				.screenshots({
					timestamps: ['50%'],
					filename: file.hash + '.jpg',
					folder: this.options.thumbsDir,
					size: this.options.width + 'x?'
				});
		});
	}
}

module.exports = Thumbnails;