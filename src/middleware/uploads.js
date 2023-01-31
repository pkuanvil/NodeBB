'use strict';

const cacheCreate = require('../cache/ttl');
const meta = require('../meta');
const helpers = require('./helpers');
const user = require('../user');
const file = require('../file');

const cache = cacheCreate({
	ttl: meta.config.uploadRateLimitCooldown * 1000,
});

exports.clearCache = function () {
	cache.clear();
};

function deleteTempFiles(files) {
	files.forEach(fileObj => file.delete(fileObj.path));
}

exports.ratelimit = helpers.try(async (req, res, next) => {
	const { uid } = req;
	if (!meta.config.uploadRateLimitThreshold || (uid && await user.isAdminOrGlobalMod(uid))) {
		return next();
	}

	const count = (cache.get(`${req.ip}:uploaded_file_count`) || 0) + req.files.files.length;
	if (count > meta.config.uploadRateLimitThreshold) {
		// @pkuanvil: guard against possible tempfile leaks
		deleteTempFiles(req.files.files);
		return next(new Error(['[[error:upload-ratelimit-reached]]']));
	}
	cache.set(`${req.ip}:uploaded_file_count`, count);
	next();
});

