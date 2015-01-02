define(["jquery", "foundation-daterangepicker"], function($){
    return Backbone.View.extend({

        events: {
            'change [data-role="start_date"]': "inputChange",
            'change [data-role="enddate"]': "inputChange"
        },

        initialize: function(args){
            var now = this.now = moment(),
                self = this,
                params = this.parseUrl(window.location.search);
            this.format = "YYYY-MM-DD HH:mm:ss";
            this.$el = args.$el;
            this.$el.daterangepicker({
                timePicker: true,
                timePicker12Hour: false,
                timePickerIncrement: 1,
                opens: "left",
                ranges: {
                    'hour': [now.clone().subtract('hour', 1), now],
                    'day': [now.clone().subtract('day', 1), now],
                    'week': [now.clone().subtract('week', 1), now],
                    'month': [now.clone().subtract('month', 1), now],
                }
            }, function(start_date, end_date){
                self.pickerChanged(start_date, end_date);
            });
            this.daterangepicker = this.$el.data('daterangepicker');
            this.daterangepicker.hide();
            this.daterangepicker.container.removeClass('hide');
            this.daterangepicker.startDate = params["from"] ? moment(params["from"]) : now.clone().subtract("hour", 1);
            this.daterangepicker.endDate = params["to"] ? moment(params["to"]) : now;
            this.start_date = this.daterangepicker.startDate;
            this.end_date = this.daterangepicker.endDate;
            this.startInput = this.$el.find('[data-role="start_date"]');
            this.endInput = this.$el.find('[data-role="end_date"]');
            this.daterangepicker.notify();
            this.daterangepicker.updateCalendars();
        },
        updateUrls : function(start_date, end_date){
                var params = this.parseUrl(window.location.search),
                    self = this,
                    defaultrange = this.daterangepicker.ranges['hour'];
                // If the range is the default range, ignore
                if(start_date.isSame(defaultrange[0]) && end_date.isSame(defaultrange[1])){
                    return;
                }
                params["from"] = start_date.format();
                params["to"] = end_date.format();
                history.pushState({}, "", window.location.pathname + "?" + decodeURIComponent($.param(params, true)));

                $('[data-url-has-params]').each(function(){
                        var params = self.parseUrl(this.search);
                        params["from"] = start_date.format();
                        params["to"] = end_date.format();
                        self.startInput.val(start_date.format(self.format));
                        self.endInput.val(end_date.format(self.format));
                        this.search = $.param(params, true);
                });
        },

        inputChange: function(){
            var start_date =  moment(this.startInput.val()),
                end_date = moment(this.endInput.val());
            if(start_date.isValid() && end_date.isValid()){
                this.start_date = this.daterangepicker.startDate = start_date;
                this.end_date = this.daterangepicker.endDate = end_date;
                this.daterangepicker.updateView();
                this.daterangepicker.updateCalendars();
                this.pickerChanged(start_date, end_date);
            }
        },

        pickerChanged: function(start_date, end_date){
            this.start_date = this.daterangepicker.startDate;
            this.end_date = this.daterangepicker.endDate;
            if(moment.isMoment(this.start_date) && moment.isMoment(this.end_date)
                    && this.start_date.isValid() && this.end_date.isValid()){
                this.updateUrls(start_date, end_date);
                this.trigger("pickerChanged", start_date, end_date);
            }
        },
        parseUrl : function(search){
                var params = {},
                pairs = search.replace(/^\?/,'').split('&');
                $.each(pairs, function(){
                    var kv = this.split("="),
                    key = kv[0],
                    value = decodeURIComponent(kv[1]);
                    if(key.length == 0){
                        return;
                    }
                    if(params[key]){
                        if(!$.isArray(params[key])){
                            params[key] = [params[key]];
                        }
                        params[key].push(value);
                    } else {
                        params[key] = value;
                    }
                });
                return params;
        }

        });
});
