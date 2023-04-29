'use strict';

const nconf = require('nconf');
const path = require('path');
const fs = require('fs');
const db = require('./mocks/databasemock');

// @pkuanvil: don't do any search in ../node_modules for test_plugins, just use plugin name
const toTest = nconf.get('test_plugins') || [];

describe('Installed Plugins', () => {
	toTest.forEach((plugin) => {
		const pathToTests = path.join(__dirname, '../node_modules', plugin, 'test');
		try {
			require(pathToTests);
		} catch (err) {
			if (err.code !== 'MODULE_NOT_FOUND') {
				console.log(err.stack);
			}
		}
	});
});
