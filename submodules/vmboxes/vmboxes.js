define(function(require){
	var $ = require('jquery'),
		_ = require('underscore'),
		monster = require('monster'),
		toastr = require('toastr'),
		timezone = require('monster-timezone');

	var app = {

		requests: {},

		subscribe: {
			'voip.vmboxes.render': 'vmboxesRender'
		},

		/* Users */
		/* args: parent and voicemailId */
		vmboxesRender: function(args) {
			var self = this,
				args = args || {},
				parent = args.parent || $('.right-content'),
				_voicemailId = args.voicemailId || '';

			self.vmboxesGetData(function(data) {
				var dataTemplate = self.vmboxesFormatListData(data),
					template = $(monster.template(self, 'vmboxes-layout', dataTemplate)),
					templateVMBox;

				_.each(dataTemplate.vmboxes, function(vmbox) {
					templateVMBox = monster.template(self, 'vmboxes-row', vmbox);

					template.find('.vmboxes-rows').append(templateVMBox);
				});

				self.vmboxesBindEvents(template, parent, dataTemplate);

				parent
					.empty()
					.append(template);

				if(_voicemailId) {
					var row = parent.find('.grid-row[data-id=' + _voicemailId + ']');

					monster.ui.highlight(row, {
						endColor: '#FCFCFC'
					});
				}

				if (dataTemplate.vmboxes.length == 0 ) {
					parent.find('.no-vmboxes-row').css('display', 'block');
				} else {
					parent.find('.no-vmboxes-row').css('display', 'none');
				}
			});
		},

		vmboxesBindEvents: function(template, parent, data) {
			var self = this,
				callbackSave = function(vmbox) {
					self.vmboxesRender({ voicemailId: vmbox.id });
				};

			template.find('.settings').on('click', function() {
				self.vmboxesRenderEdit($(this).parents('.grid-row').data('id'), callbackSave);
			});

			template.find('.add-vmbox').on('click', function() {
				self.vmboxesRenderEdit(undefined, callbackSave);
			});

			template.find('.vmboxes-header .search-query').on('keyup', function() {
				var searchString = $(this).val().toLowerCase(),
					rows = template.find('.vmboxes-rows .grid-row:not(.title)'),
					emptySearch = template.find('.vmboxes-rows .empty-search-row');

				_.each(rows, function(row) {
					var row = $(row);

					row.data('search').toLowerCase().indexOf(searchString) < 0 ? row.hide() : row.show();
				});

				if(rows.size() > 0) {
					rows.is(':visible') ? emptySearch.hide() : emptySearch.show();
				}
			});
		},

		vmboxesRenderEdit: function(id, callback) {
			var self = this;

			self.vmboxesGetEditData(id, function(data) {
				self.vmboxesRenderVmbox(data, callback);
			});
		},
		
		vmboxesRenderVmbox: function(data, callback) {
			var self = this
				mode = data.id ? 'edit' : 'add',
				popupTitle = mode === 'edit' ? monster.template(self, '!' + self.i18n.active().vmboxes.editTitle, { name: data.name }) : self.i18n.active().vmboxes.addTitle;
				templateVMBox = $(monster.template(self, 'vmboxes-edit', data)),
				callbacks = {
					afterSave: function(vmbox) {
						popup.dialog('close').remove();

						callback && callback(vmbox);
					},
					afterDelete: function(vmbox) {
						popup.dialog('close').remove();

						self.vmboxesRender();
					},
					afterCancel: function() {
						popup.dialog('close').remove();
					}
				};

			_.each(data.notify_email_address, function(recipient) {
				templateVMBox.find('.saved-entities')
							  .append(monster.template(self, 'vmboxes-emailRow', { name: recipient }));
			});

			self.vmboxesEditBindEvents(templateVMBox, data, callbacks);

			var popup = monster.ui.dialog(templateVMBox, {
				position: ['center', 20],
				title: popupTitle
			});
		},

		vmboxesEditBindEvents: function(templatVMBox, data, callbacks) {
			var self = this,
				vmboxForm = templateVMBox.find('#form_vmbox');

			monster.ui.validate(vmboxForm, {
				rules: {
					'name': {
						required: true
					}
				}
			});

			monster.ui.tabs(templateVMBox);

			timezone.populateDropdown(templateVMBox.find('#timezone'), data.timezone);
			templateVMBox.find('#timezone').chosen({search_contains: true, width: "40%"});

			templateVMBox.find('[data-toggle="tooltip"]').tooltip();
			templateVMBox.find('.switch').bootstrapSwitch();

			templateVMBox.find('.actions .save').on('click', function() {
				if(monster.ui.valid(vmboxForm)) {
					var dataToSave = self.vmboxesMergeData(data, templateVMBox);

					self.vmboxesSaveVmbox(dataToSave, function(data) {
						callbacks.afterSave && callbacks.afterSave(data);
					});
				} else {
					templateVMBox.find('.tabs-selector[data-section="basic"]').click();
				}
			});

			templateVMBox.find('#delete_vmbox').on('click', function() {
				var voicemailId = $(this).parents('.edit-vmbox').data('id');

				monster.ui.confirm(self.i18n.active().vmboxes.confirmDeleteVmbox, function() {
					self.vmboxesDeleteVmbox(voicemailId, function(vmbox) {
						toastr.success(monster.template(self, '!' + self.i18n.active().vmboxes.deletedVmbox, { vmboxName: vmbox.name }));

						callbacks.afterDelete && callbacks.afterDelete(vmbox);
					});
				});
			});

			templateVMBox.find('.actions .cancel-link').on('click', function() {
				callbacks.afterCancel && callbacks.afterCancel();
			});

			// Recipients stuff
			var addEntity = function(event) {
				event.preventDefault();

				var inputName = templateVMBox.find('#entity_name'),
					name = inputName.val();
					templateFlag = monster.template(self, 'vmboxes-emailRow', { name: name });

				templateVMBox.find('.saved-entities').prepend(templateFlag);

				inputName.val('')
						 .focus();
			};

			templateVMBox.find('.entity-wrapper.placeholder:not(.active)').on('click', function(){
				$(this).addClass('active');
				templateVMBox.find('#entity_name').focus();
			});

			templateVMBox.find('#cancel_entity').on('click', function(e) {
				e.stopPropagation();

				$(this).siblings('input').val('');

				templateVMBox.find('.entity-wrapper.placeholder')
						.removeClass('active');
			});

			templateVMBox.find('#add_entity').on('click', function(e) {
				addEntity(e);
			});

			templateVMBox.find('#entity_name').on('keypress', function(e) {
				var code = e.keyCode || e.which;

				if(code === 13) {;
					addEntity(e);
				}
			});

			templateVMBox.find('.saved-entities').on('click', '.delete-entity', function() {
				$(this).parents('.entity-wrapper').remove();
			});
		},

		vmboxesMergeData: function(originalData, template) {
			var self = this,
				formData = monster.ui.getFormData('form_vmbox'),
				mergedData = $.extend(true, {}, originalData, formData);

			// Rebuild list of recipients from UI
			mergedData.notify_email_address = [];
			template.find('.saved-entities .entity-wrapper').each(function() {
				mergedData.notify_email_address.push($(this).data('name'));
			});

			mergedData.not_configurable = !formData.extra.configurable;

			if(mergedData.pin === '') {
				delete mergedData.pin;
			}

			delete mergedData.extra;

			return mergedData;
		},

		vmboxesFormatData: function(data) {
			var self = this,
				defaults = {
					require_pin: true,
					check_if_owner: true
				},
				formattedData = $.extend(true, {}, defaults, data.vmbox);

			formattedData.extra = {};

			return formattedData;
		},

		vmboxesFormatListData: function(results) {
			var self = this,
				formattedData = {
					countVMBoxes: results.vmboxes.length,
					vmboxes: results.vmboxes
				},
				mapUsers = {};

			_.each(results.users, function(user) {
				mapUsers[user.id] = user;
			});

			formattedData.vmboxes.sort(function(a,b) {
				return parseInt(a.mailbox) > parseInt(b.mailbox) ? 1 : -1;
			});

			_.each(formattedData.vmboxes, function(vmbox) {
				if(vmbox.hasOwnProperty('owner_id') && mapUsers.hasOwnProperty(vmbox.owner_id)) {
					vmbox.friendlyOwnerName = mapUsers[vmbox.owner_id].first_name + ' ' + mapUsers[vmbox.owner_id].last_name;
				}
				else {
					vmbox.friendlyOwnerName = '-';
				}
			});

			return formattedData;
		},

		/* Utils */
		vmboxesDeleteVmbox: function(voicemailId, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.delete',
				data: {
					accountId: self.accountId,
					voicemailId: voicemailId,
					data: {}
				},
				success: function(data) {
					callback(data.data);
				}
			});
		},

		vmboxesGetEditData: function(id, callback) {
			var self = this;

			monster.parallel({
					vmbox: function(callback) {
						if(id) {
							self.vmboxesGetVmbox(id, function(dataVmbox) {
								callback(null, dataVmbox);
							});
						}
						else {
							callback(null, {});
						}
					}
				},
				function(error, results) {
					var formattedData = self.vmboxesFormatData(results);

					callback && callback(formattedData);
				}
			);
		},

		vmboxesGetVmbox: function(voicemailId, callbackSuccess, callbackError) {
			var self = this;

			self.callApi({
				resource: 'voicemail.get',
				data: {
					accountId: self.accountId,
					voicemailId: voicemailId
				},
				success: function(data) {
					callbackSuccess && callbackSuccess(data.data);
				},
				error: function(data) {
					callbackError && callbackError(data);
				}
			});
		},

		vmboxesSaveVmbox: function(vmboxData, callback) {
			var self = this;

			if(vmboxData.id) {
				self.vmboxesUpdateVmbox(vmboxData, callback);
			}
			else {
				self.vmboxesCreateVmbox(vmboxData, callback);
			}
		},

		vmboxesCreateVmbox: function(vmboxData, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.create',
				data: {
					accountId: self.accountId,
					data: vmboxData
				},
				success: function(data) {
					callback(data.data);
				}
			});
		},

		vmboxesUpdateVmbox: function(vmboxData, callbackSuccess, callbackError) {
			var self = this;

			self.callApi({
				resource: 'voicemail.update',
				data: {
					accountId: self.accountId,
					data: vmboxData,
					voicemailId: vmboxData.id
				},
				success: function(data) {
					callbackSuccess && callbackSuccess(data.data);
				},
				error: function(data) {
					callbackError && callbackError(data);
				}
			});
		},

		vmboxesGetData: function(callback) {
			var self = this;

			monster.parallel({
					users: function(callback) {
						self.callApi({
							resource: 'user.list',
							data: {
								accountId: self.accountId,
								filters: {
									paginate: 'false'
								}
							},
							success: function(dataUsers) {
								callback && callback(null, dataUsers.data);
							}
						});
					},
					vmboxes: function(callback) {
						self.callApi({
							resource: 'voicemail.list',
							data: {
								accountId: self.accountId,
								filters: {
									paginate: 'false'
								}
							},
							success: function(datavmboxes) {
								callback(null, datavmboxes.data);
							}
						});
					}
				},
				function(err, results) {
					self.vmboxesFormatListData(results);

					callback && callback(results);
				}
			);
		}
	};

	return app;
});