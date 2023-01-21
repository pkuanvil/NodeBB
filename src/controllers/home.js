'use strict';

const qs = require('qs');

const plugins = require('../plugins');
const meta = require('../meta');
const user = require('../user');

function adminHomePageRoute() {
	return ((meta.config.homePageRoute === 'custom' ? meta.config.homePageCustom : meta.config.homePageRoute) || 'categories').replace(/^\//, '');
}

async function getUserHomeRoute(uid) {
	const settings = await user.getSettings(uid);
	let route = adminHomePageRoute();

	if (settings.homePageRoute !== 'undefined' && settings.homePageRoute !== 'none') {
		route = (settings.homePageRoute || route).replace(/^\/+/, '');
	}

	return route;
}

async function rewrite(req, res, next) {
	if (req.path !== '/' && req.path !== '/api/' && req.path !== '/api') {
		return next();
	}
	let route = adminHomePageRoute();
	if (meta.config.allowUserHomePage) {
		route = await getUserHomeRoute(req.uid, next);
	}

	let parsedUrl;
	let parsedUrlQuery;
	try {
		// @pkuanvil: use WHATWG URL() api instead of the deprecated url.parse()
		const basePlaceholder = 'https://example.org/';
		parsedUrl = new URL(route, basePlaceholder);
		// @pkuanvil: fix query string handling
		parsedUrlQuery = qs.parse(parsedUrl.search.substring(1));
	} catch (err) {
		return next(err);
	}

	const { pathname } = parsedUrl;
	const hook = `action:homepage.get:${pathname}`;
	if (!plugins.hooks.hasListeners(hook)) {
		// @pkuanvil: URL() pathname always starts with '/'
		req.url = req.path + (!req.path.endsWith('/') ? '/' : '') + pathname.substring(1);
	} else {
		res.locals.homePageRoute = pathname;
	}
	req.query = Object.assign(parsedUrlQuery, req.query);

	next();
}

exports.rewrite = rewrite;

function pluginHook(req, res, next) {
	const hook = `action:homepage.get:${res.locals.homePageRoute}`;

	plugins.hooks.fire(hook, {
		req: req,
		res: res,
		next: next,
	});
}

exports.pluginHook = pluginHook;
