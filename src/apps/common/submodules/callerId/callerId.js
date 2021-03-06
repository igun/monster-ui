define(function(require) {
	var $ = require('jquery'),
		_ = require('lodash'),
		monster = require('monster');

	var callerId = {

		requests: {
		},

		subscribe: {
			'common.callerId.renderPopup': 'callerIdEdit'
		},

		callerIdEdit: function(args) {
			var self = this,
				argsCommon = {
					success: function(dataNumber) {
						self.callerIdRender(dataNumber, args.accountId, args.callbacks);
					},
					number: args.phoneNumber
				};

			if (args.hasOwnProperty('accountId')) {
				argsCommon.accountId = args.accountId;
			}

			monster.pub('common.numbers.editFeatures', argsCommon);
		},

		callerIdRender: function(dataNumber, pAccountId, callbacks) {
			var self = this,
				popup_html = $(self.getTemplate({
					name: 'layout',
					data: dataNumber.cnam || {},
					submodule: 'callerId'
				})),
				popup,
				accountId = pAccountId || self.accountId,
				form = popup_html.find('#cnam');

			monster.ui.validate(form, {
				rules: {
					'display_name': {
						minlength: 1,
						maxlength: 15
					}
				}
			});

			popup_html.find('.save').on('click', function(ev) {
				ev.preventDefault();

				if (monster.ui.valid(form)) {
					var cnamFormData = monster.ui.getFormData('cnam');

					_.extend(dataNumber, { cnam: cnamFormData });

					if (cnamFormData.display_name === '') {
						delete dataNumber.cnam.display_name;
					}

					self.callerIdUpdateNumber(dataNumber.id, accountId, dataNumber,
						function(data) {
							monster.ui.toast({
								type: 'success',
								message: self.getTemplate({
									name: '!' + self.i18n.active().callerId.successCnam,
									data: {
										phoneNumber: monster.util.formatPhoneNumber(data.data.id)
									}
								})
							});

							popup.dialog('destroy').remove();

							callbacks.success && callbacks.success(data);
						},
						function(data) {
							callbacks.error && callbacks.error(data);
						}
					);
				}
			});

			popup_html.find('.cancel-link').on('click', function(e) {
				e.preventDefault();
				popup.dialog('destroy').remove();
			});

			popup = monster.ui.dialog(popup_html, {
				title: self.i18n.active().callerId.dialogTitle
			});
		},

		callerIdUpdateNumber: function(phoneNumber, accountId, data, success, error) {
			var self = this;

			// The back-end doesn't let us set features anymore, they return the field based on the key set on that document.
			delete data.features;

			self.callApi({
				resource: 'numbers.update',
				data: {
					accountId: accountId,
					phoneNumber: encodeURIComponent(phoneNumber),
					data: data
				},
				success: function(_data, status) {
					if (typeof success === 'function') {
						success(_data);
					}
				},
				error: function(_data, status) {
					if (typeof error === 'function') {
						error(_data);
					}
				}
			});
		}
	};

	return callerId;
});
