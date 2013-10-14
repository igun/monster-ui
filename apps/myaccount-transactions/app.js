define(function(require){
	var $ = require('jquery'),
		_ = require('underscore'),
		monster = require('monster'),

		templates = {
			menu: 'menu',
			transactions: 'transactions',
			listTransactions: 'listTransactions'
		};

	var app = {

		name: 'myaccount-transactions',

		i18n: [ 'en-US' ],

		requests: {
			'transactions.getMonthly': {
				url: 'accounts/{accountId}/transactions/monthly_recurring?created_from={from}&created_to={to}',
				verb: 'GET'
			},
			'transactions.getSubscriptions': {
				url: 'accounts/{accountId}/transactions/subscriptions',
				verb: 'GET'
			},
			'transactions.getCharges': {
				url: 'accounts/{accountId}/transactions?reason=no_call&created_from={from}&created_to={to}',
				verb: 'GET'
			}
		},

		subscribe: {
			'myaccount-transactions.renderContent': '_renderContent'
		},

		load: function(callback){
			var self = this;

			self.initApp(function() {
				callback && callback(self);
			});
		},

		initApp: function(callback) {
			var self = this;

			monster.pub('auth.initApp', {
				app: self,
				callback: callback
			});
		},

		render: function(callback){
			var self = this,
				transactionsMenu = $(monster.template(self, 'menu')),
				args = {
					name: self.name,
					title: self.i18n.active().title,
					menu: transactionsMenu,
					weight: 10,
					category: 'billingCategory'
				};

			monster.pub('myaccount.addSubmodule', args);

			callback && callback();
		},

		_renderContent: function(args) {
			var self = this,
				range = 31,
				now = new Date(),
				to = monster.util.dateToGregorian(new Date(now.setDate(now.getDate() + 1))),
				from = to - (range * 60 * 60 * 24);

			self.listTransactions(from, to, function(data) {
				var transactionsView = $(monster.template(self, 'transactions', data)),
					listTransactionsView = monster.template(self, 'listTransactions', data);

				transactionsView.find('.list-transactions').append(listTransactionsView);

				monster.ui.initRangeDatepicker(range, transactionsView);

				self.bindEvents(transactionsView);

				monster.pub('myaccount.renderSubmodule', transactionsView);
			});
		},

		cleanFormData: function(module, data) {
			delete data.extra;

			return data;
		},

		formatData: function(data) {
			var self = this;

			data.amount = parseFloat(data.amount).toFixed(2);

			data.listTransactions.sort(function(a, b) {
				return a.created < b.created;
			});

			console.log(data.listTransactions);
			if(data.listTransactions) {
				$.each(data.listTransactions, function(k, v) {
					v.reason = self.i18n.active()[v.reason ? v.reason : 'oneTimeCharge'];
				});
			}

			return data;
		},

		bindEvents: function(parent, data) {
			var self = this;

			parent.find('.expandable').hide();

			parent.on('click', '.expand-box', function() {
				var current = $(this),
					expandable = current.parents('.transaction').first().find('.expandable'),
					content = !expandable.is(':visible') ? '-' : '+';

				current.find('.expand').html(content);
				expandable.slideToggle('fast');
			});

			parent.find('#filter_transactions').on('click', function() {
				from = monster.util.dateToGregorian(new Date(parent.find('#startDate').val()));
				to = monster.util.dateToGregorian(new Date(parent.find('#endDate').val()));

				self.listTransactions(from, to, function(data) {
					var listTransactions = parent.find('.list-transactions').empty();

					listTransactions.append(monster.template(self, 'listTransactions', data));

					parent.find('.expandable').hide();

					parent.find('.billing-date.start').html(data.billingStartDate);
					parent.find('.billing-date.end').html(data.billingEndDate);
					parent.find('.total-amount').html(data.amount);
				});
			});
		},

		//utils
		listTransactions: function(from, to, callback) {
			var self = this,
				defaults = {
					amount: 0.00,
					billingStartDate: monster.util.toFriendlyDate(from, 'short'),
					billingEndDate: monster.util.toFriendlyDate(to, 'short')
				};

			monster.parallel({
					monthly: function(callback) {
						self.getMonthlyTransactions(from, to, function(dataMonthly) {
							var arrayTransactions = [];

							$.each(dataMonthly.data, function(k, v) {
								if(v.add_ons.length === 0 && v.discounts.length === 0) {
									v.type = 'charges';
								}
								else {
									var mapDiscounts = {};
									_.each(v.discounts, function(discount) {
										mapDiscounts[discount.id] = discount;
									});

									v.type = v.prorated ? 'prorated' : 'monthly';
									v.services = [];

									$.each(v.add_ons, function(k, addOn) {
										var discount = 0;

										addOn.amount = parseFloat(addOn.amount).toFixed(2);
										addOn.quantity = parseFloat(addOn.quantity);

										if((addOn.id + '_discount') in mapDiscounts) {
											var discountItem = mapDiscounts[addOn.id + '_discount'];
											discount = parseInt(discountItem.quantity) * parseFloat(discountItem.amount);
										}

										addOn.monthly_charges = ((addOn.amount * addOn.quantity) - discount).toFixed(2);

										v.services.push({
											service: monster.apps['myaccount-servicePlan'].i18n.active().titles[addOn.id],
											rate: addOn.amount,
											quantity: addOn.quantity,
											discount: discount > 0 ? '-' + self.i18n.active().currencyUsed + parseFloat(discount).toFixed(2) : '',
											monthly_charges: addOn.monthly_charges
										});
									});

									v.services.sort(function(a, b) {
										return parseFloat(a.rate) <= parseFloat(b.rate);
									});
								}

								v.amount = parseFloat(v.amount).toFixed(2);
								v.friendlyCreated = monster.util.toFriendlyDate(v.created_at, 'short');
								v.created = v.created_at;
								arrayTransactions.push(v);

								defaults.amount += parseFloat(v.amount);
							});

							callback(null, arrayTransactions);
						});
					},
					charges: function(callback) {
						self.getCharges(from, to, function(dataCharges) {
							var arrayCharges = [];

							$.each(dataCharges.data, function(k, v) {
								v.type = 'charges';
								v.amount = parseFloat(v.amount).toFixed(2);
								v.friendlyCreated = monster.util.toFriendlyDate(v.created, 'short');
								arrayCharges.push(v);

								defaults.amount += parseFloat(v.amount);
							});

							callback(null, arrayCharges);
						});
					}
				},
				function(err, results) {
					var renderData = defaults;

					renderData.listTransactions = (results.charges).concat(results.monthly);

					renderData = self.formatData(renderData);

					callback(renderData);
				}
			);
		},

		getMonthlyTransactions: function(from, to, success, error) {
			var self = this;

			monster.request({
				resource: 'transactions.getMonthly',
				data: {
					accountId: self.accountId,
					from: from,
					to: to
				},
				success: function(data, status) {
					success && success(data, status);
				},
				error: function(data, status) {
					error && error(data, status);
				}
			});
		},

		getSubscriptions: function(success, error) {
			var self = this;

			monster.request({
				resource: 'transactions.getSubscriptions',
				data: {
					accountId: self.accountId,
				},
				success: function(data, status) {
					success && success(data, status);
				},
				error: function(data, status) {
					error && error(data, status);
				}
			});
		},

		getCharges: function(from, to, success, error) {
			var self = this;

			monster.request({
				resource: 'transactions.getCharges',
				data: {
					accountId: self.accountId,
					from: from,
					to: to
				},
				success: function(data, status) {
					success && success(data, status);
				},
				error: function(data, status) {
					error && error(data, status);
				}
			});
		}
	};

	return app;
});
