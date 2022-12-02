'use strict';


define('forum/register', [
	'translator', 'slugify', 'api', 'bootbox', 'forum/login', 'zxcvbn', 'jquery-form',
], function (translator, slugify, api, bootbox, Login, zxcvbn) {
	const Register = {};
	let validationError = false;
	const successIcon = '';

	// https://gist.github.com/Deliaz/e89e9a014fea1ec47657d1aac3baa83c
	// Note: no converting btoa() here
	function ab2str(buffer) {
		let binary = '';
		let bytes = new Uint8Array(buffer);
		let len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return binary
	}
	// https://github.com/mdn/dom-examples/blob/main/web-crypto/import-key/spki.js
	function str2ab(str) {
		const buf = new ArrayBuffer(str.length);
		const bufView = new Uint8Array(buf);
		for (let i = 0, strLen = str.length; i < strLen; i++) {
			bufView[i] = str.charCodeAt(i);
		}
		return buf;
	}

	Register.init = function () {
		const username = $('#username');
		const password = $('#password');
		const password_confirm = $('#password-confirm');
		const register = $('#register');
		const pr_button = $('#pr-button')
		const pr_email = $('#pr-email')
		const pr_txt = $('#pr-txt')
		const pr_feedback = $('#pr-feedback')
		let pubkey_promise = api.get("/api/v3/plugins/pr_pubkey")
		let pubkey_str = ""
		let pr_placeholder = ""

		handleLanguageOverride();

		$('#content #noscript').val('false');

		const query = utils.params();
		if (query.token) {
			$('#token').val(query.token);
		}

		// Update the "others can mention you via" text
		username.on('keyup', function () {
			$('#yourUsername').text(this.value.length > 0 ? slugify(this.value) : 'username');
		});

		username.on('blur', function () {
			if (username.val().length) {
				validateUsername(username.val());
			}
		});

		password.on('blur', function () {
			if (password.val().length) {
				validatePassword(password.val(), password_confirm.val());
			}
		});

		password_confirm.on('blur', function () {
			if (password_confirm.val().length) {
				validatePasswordConfirm(password.val(), password_confirm.val());
			}
		});

		api.get("/api/v3/plugins/pr_register_email").then(function (emailstr) {
			pr_email.text(emailstr)
		}).catch(function (e) {
			showError(pr_feedback, e)
		})

		function cleartext() {
			if (pr_placeholder) {
				pr_txt.text(pr_placeholder)
			} else {
				translator.translate('[[pr-txt-placeholder]]', function (translated) {
					pr_placeholder = translated
					pr_txt.text(pr_placeholder)
				})
			}
		}
		username.on('focus', cleartext)
		password.on('focus', cleartext)
		password_confirm.on('focus', cleartext)

		pr_button.on('click', async function (e) {
			e.preventDefault()
			validationError = false
			validatePassword(password.val(), password_confirm.val())
			validatePasswordConfirm(password.val(), password_confirm.val())
			validateUsername(username.val())
			if (validationError) {
				return
			}
			try {
				const PREFIX = 'USeRnaMe\n'
				const regreq = PREFIX + username.val() + '\n' + password.val()
				if (!pubkey_str) {
					pubkey_str = await pubkey_promise
				}
				const pubkey = await importRSAPublicKey(pubkey_str)
				const regreq_enc = await crypto.subtle.encrypt({name: "RSA-OAEP"}, pubkey, str2ab(regreq))
				const regreq_enc_base64 = btoa(ab2str(regreq_enc))
				pr_txt.text(regreq_enc_base64)
			} catch (e) {
				showError(pr_feedback, e)
			}
		})

		function validateForm(callback) {
			validationError = false;
			validatePassword(password.val(), password_confirm.val());
			validatePasswordConfirm(password.val(), password_confirm.val());
			validateUsername(username.val(), callback);
		}

		// Guard against caps lock
		Login.capsLockCheck(document.querySelector('#password'), document.querySelector('#caps-lock-warning'));

		register.on('click', function (e) {
			const registerBtn = $(this);
			const errorEl = $('#register-error-notify');
			errorEl.addClass('hidden');
			e.preventDefault();
			validateForm(function () {
				if (validationError) {
					return;
				}

				registerBtn.addClass('disabled');

				registerBtn.parents('form').ajaxSubmit({
					headers: {
						'x-csrf-token': config.csrf_token,
					},
					success: function (data) {
						registerBtn.removeClass('disabled');
						if (!data) {
							return;
						}
						if (data.next) {
							const pathname = utils.urlToLocation(data.next).pathname;

							const params = utils.params({ url: data.next });
							params.registered = true;
							const qs = decodeURIComponent($.param(params));

							window.location.href = pathname + '?' + qs;
						} else if (data.message) {
							translator.translate(data.message, function (msg) {
								bootbox.alert(msg);
								ajaxify.go('/');
							});
						}
					},
					error: function (data) {
						translator.translate(data.responseText, config.defaultLang, function (translated) {
							if (data.status === 403 && data.responseText === 'Forbidden') {
								window.location.href = config.relative_path + '/register?error=csrf-invalid';
							} else {
								errorEl.find('p').text(translated);
								errorEl.removeClass('hidden');
								registerBtn.removeClass('disabled');
							}
						});
					},
				});
			});
		});

		// Set initial focus
		$('#username').focus();
	};

	// Modified from https://github.com/mdn/dom-examples/blob/main/web-crypto/import-key/spki.js
	async function importRSAPublicKey(pem) {
		// Note: The newline in Header and Footer is mandatory for our PEM string
		const pemHeader = "-----BEGIN PUBLIC KEY-----\n";
		const pemFooter = "-----END PUBLIC KEY-----\n";
		const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length);
		// base64 decode the string to get the binary data
		const binaryDerString = window.atob(pemContents);
		// convert from a binary string to an ArrayBuffer
		const binaryDer = str2ab(binaryDerString);

		return window.crypto.subtle.importKey("spki", binaryDer, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
	}

	function validateUsername(username, callback) {
		callback = callback || function () {};

		const username_notify = $('#username-notify');
		const userslug = slugify(username);
		if (username.length < ajaxify.data.minimumUsernameLength || userslug.length < ajaxify.data.minimumUsernameLength) {
			showError(username_notify, '[[error:username-too-short]]');
		} else if (username.length > ajaxify.data.maximumUsernameLength) {
			showError(username_notify, '[[error:username-too-long]]');
		} else if (!utils.isUserNameValid(username) || !userslug) {
			showError(username_notify, '[[error:invalid-username]]');
		} else {
			Promise.allSettled([
				api.head(`/users/bySlug/${username}`, {}),
				api.head(`/groups/${username}`, {}),
			]).then((results) => {
				if (results.every(obj => obj.status === 'rejected')) {
					showSuccess(username_notify, successIcon);
				} else {
					showWarning(username_notify, '[[error:pr-username-taken]]');
				}

				callback();
			});
		}
	}

	function validatePassword(password, password_confirm) {
		const password_notify = $('#password-notify');
		const password_confirm_notify = $('#password-confirm-notify');

		try {
			utils.assertPasswordValidity(password, zxcvbn);

			if (password === $('#username').val()) {
				throw new Error('[[user:password_same_as_username]]');
			}

			showSuccess(password_notify, successIcon);
		} catch (err) {
			showError(password_notify, err.message);
		}

		if (password !== password_confirm && password_confirm !== '') {
			showError(password_confirm_notify, '[[user:change_password_error_match]]');
		}
	}

	function validatePasswordConfirm(password, password_confirm) {
		const password_notify = $('#password-notify');
		const password_confirm_notify = $('#password-confirm-notify');

		if (!password || password_notify.hasClass('alert-error')) {
			return;
		}

		if (password !== password_confirm) {
			showError(password_confirm_notify, '[[user:change_password_error_match]]');
		} else {
			showSuccess(password_confirm_notify, successIcon);
		}
	}

	function showWarning(element, msg) {
		translator.translate(msg, function (msg) {
			element.html(msg);
			element.parent()
				.removeClass('register-success')
				.addClass('register-danger');
			element.show();
		});
	}

	function showError(element, msg) {
		translator.translate(msg, function (msg) {
			element.html(msg);
			element.parent()
				.removeClass('register-success')
				.addClass('register-danger');
			element.show();
		});
		validationError = true;
	}

	function showSuccess(element, msg) {
		translator.translate(msg, function (msg) {
			element.html(msg);
			element.parent()
				.removeClass('register-danger')
				.addClass('register-success');
			element.show();
		});
	}

	function handleLanguageOverride() {
		if (!app.user.uid && config.defaultLang !== config.userLang) {
			const formEl = $('[component="register/local"]');
			const langEl = $('<input type="hidden" name="userLang" value="' + config.userLang + '" />');

			formEl.append(langEl);
		}
	}

	return Register;
});
