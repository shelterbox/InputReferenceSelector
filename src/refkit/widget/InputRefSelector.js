/*jslint white:true, nomen: true, plusplus: true */
/*global mx, mxui, mendix, require, console, define, module, logger */
/*mendix */
logger.level(logger.ALL);

define([

    // Mixins
    "dojo/_base/declare", "mxui/widget/_WidgetBase", "dijit/_TemplatedMixin",

    // Client API and DOJO functions
    "mxui/dom",
    "dojo/dom",
    "dojo/query",
    "dojo/dom-prop",
    "dojo/dom-geometry",
    "dojo/dom-class",
    "dojo/dom-attr",
    "dojo/dom-style",
    "dojo/_base/window",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/html",
    "dojo/ready",

    "mendix/lib/MxContext",

    "dijit/form/ComboBox",

    // External libraries
    "refkit/lib/XPathSource",
    "refkit/lib/jquery",

    // Templates
    "dojo/text!refkit/templates/InputReferenceSelector.html"

], function (

       // Mixins
       declare,
       _WidgetBase,
       _TemplatedMixin,

        // Client API and DOJO functions
        dom,
        dojoDom,
        domQuery,
        domProp,
        domGeom,
        domClass,
        domAttr,
        domStyle,
        win,
        domConstruct,
        dojoArray,
        dojolang,
        html,
        ready,

        MxContext,

        ComboBox,

        XPathSource,
        _jQuery,

        // Templates
        template) {

    "use strict";

    var $ = _jQuery.noConflict(true);

    // Declare widget.
    return declare("refkit.widget.InputRefSelector", [_WidgetBase, _TemplatedMixin], {

        // Template path
        templateString: template,

        // Set by Modeler
        objreference : "",
        objattribute : "",
        constraints  : "",
        suggestions  : 5,
        fetchmethod  : "contains", // you want to have default for this
        autocomplete : true,
        onchangemf   : "",
        notfoundmf   : "",
        searchdelay  : 300,
        searchempty  : true,
        sortattrs    : "",
        sortorder    : "",

        // Internal
        sourceObject   : null,
        referredEntity : "",
        currentValue   : "",
        currentConstr  : "",

        sortParams     : null,
        xpathSource    : null,
        comboBox       : null,

        ignoreChange   : false,
        isInactive     : false,

        _handles: null,
        _contextObj: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function() {
            this._handles = [];
        },

        postCreate : function() {
            logger.debug(this.id + ".postCreate");
            this.sortParams = [];
            mendix.lang.sequence([
                "actParseConfig",
                "actSetupSource",
                "actSetupInput"
            ], null, this);
        },

        applyContext : function(context, callback) {
            logger.debug(this.id + ".applyContext");
            var trackId = context && context.getTrackId();
            if (trackId) {
                var cs     = this.constraints,
                    constr = this.currentConstr = cs ? this.matchTokens(cs, context.getTrackId()) : "";
                if (constr != cs) {
                    // update constraints
                    this.xpathSource.updateConstraints(constr);
                }
                mx.data.get({
                    guid     : trackId,
                    callback : this.setSourceObject.bind(this)
                });
            } else {
                this.setSourceObject(null);
            }

            if (callback) {
              callback();
            }
        },

        actParseConfig : function(callback) {
            logger.debug(this.id + ".parseConfig");
            var splits    = this.objreference.split("/"),
                sortAttrs = this.sortattrs.split(";"),
                sortOrder = this.sortorder.split(";");

            this.name           = splits[0];
            this.objreference   = splits[0];
            this.referredEntity = splits[1];

            for (var i = 0, attr; attr = sortAttrs[i]; i++) {
                this.sortParams.push([attr, sortOrder[i]]);
            }

            if (callback) {
              callback();
            }
        },

        actSetupSource : function(callback) {
            logger.debug(this.id + ".actSetupSource");

            this.xpathSource = new XPathSource({
                caller      : this.id,
                limit       : this.suggestions,
                entity      : this.referredEntity,
                attribute   : this.objattribute,
                constraints : this.constraints,
                fetchmethod : this.fetchmethod,
                searchempty : this.searchempty,
                sortorder   : this.sortParams
            });

            if (callback) {
              callback();
            }
        },

        actSetupInput : function(callback) {
            logger.debug(this.id + ".actSetupInput");

        		if (!this.comboBox) {
        			this.comboBox = new ComboBox({
        				store        : this.xpathSource,
        				queryExpr    : "${0}",
        				searchAttr   : this.objattribute,
        				searchDelay  : this.searchdelay,
        				tabIndex     : 0,
        				hasDownArrow : false,
        				autoComplete : this.autocomplete
        			});
        		}

            this.domNode.appendChild(this.comboBox.domNode);
            dojo.connect(this.comboBox, "onChange", this.valueChange.bind(this));
            this.comboBox.domNode.removeAttribute("tabIndex");

            if (callback) {
              callback();
            }
        },

        setSourceObject : function(obj) {
            logger.debug(this.id + ".setSourceObject");

            this.sourceObject = obj;

            if (this._handles) {
                dojoArray.forEach(this._handles, function (handle) {
                    mx.data.unsubscribe(handle);
                });
                this._handles = [];
            }

            if(obj) {
                if (!this.isInactive) {
                  this.comboBox.attr("disabled", false);
                }

                var guid = obj.getGuid();
                var objectHandle = this.subscribe({
                  guid: obj.getGuid(),
                  callback: this.changeReceived.bind(this)
                });
                this._handles = [ objectHandle ];
                this.getReferredObject(obj.get(this.objreference));
            } else {
                this.comboBox.attr("disabled", true);
            }
        },

        objectUpdateNotification : function() {
            logger.debug(this.id + ".objectUpdateNotification");
            this.getReferredObject(this.sourceObject.get(this.objreference));
        },

        changeReceived : function(guid, attr, value) {
            logger.debug(this.id + ".changeReceived, change: ",arguments);
            if (!this.ignoreChange) {
                this.getReferredObject(value);
            }
        },

        getReferredObject : function(guid) {
            logger.debug(this.id + ".getReferredObject");
            this.currentValue = guid;
            if (guid) {
                mx.data.get({
                    guid     : guid,
                    callback : function(obj) {
                        if (obj.isEnum(this.objattribute)){
                            this.setDisplayValue(obj.getEnumCaption(this.objattribute));
                        } else {
                            this.setDisplayValue(obj.get(this.objattribute));
                        }

                    }.bind(this)
                });
            } else {
                this.setDisplayValue("");
            }
        },

        setDisplayValue : function(value) {
            logger.debug(this.id + ".setDisplayValue", value);
            this.ignoreChange = true;

        		if (this.comboBox) {
        			this.comboBox.attr("value", value);
            }

            var self = this;

            $('div#' + this.id).focusin(function() {
               $(this).addClass('MxClient_Focus');
               $(this).css('outline', '#333 auto 2px');
               if ($('div#' + self.id + ' div').hasClass('dijitTextBoxFocused')) {
                    $('div#' + self.id + ' div').css('outline', 'rgb(0, 0, 0) auto 0px');
               }
            });

            $('div#' + this.id).focusout(function() {
               $(this).removeClass('MxClient_Focus');
               $(this).css('outline', 'transparent auto 0px');
            });

            setTimeout(function() { self.ignoreChange = false; }, 10);
        },

        valueChange : function(value, target) {
            logger.debug(this.id + ".valueChange", value, target);
            if (!this.ignoreChange) {
                this.ignoreChange = true;
                this.getGuid(dojo.hitch(this, function(guid) {
                    if (guid === "" && this.notfoundmf !== "") {
                        mx.data.create({
                            entity: this.referredEntity,
                            callback : function (obj) {
                                obj.set(this.objattribute, value);
                                obj.save({ callback : function () {}});
                                this.sourceObject.addReference(this.objreference, obj.getGuid());
                                this.sourceObject.save({
                                    callback : function () {
                                        this.ignoreChange = false;
                                        this.executeMF(this.notfoundmf);
                                    }.bind(this)
                                });
                            }.bind(this),
                            error    : function () {
                                // Error
                            },
                            context  : null
                        });
                    } else if (guid != this.currentValue) {
                        this.sourceObject.set(this.objreference, this.currentValue = guid);
                        this.ignoreChange = false;
                        this.executeMF(this.onchangemf);
                    }
                }));
            }
        },

        executeMF : function (mf) {
            logger.debug(this.id + ".executeMF", mf);
            if (mf) {
                var context = new MxContext();

                if (this.sourceObject) {
                    context.setContext(this.sourceObject.getEntity(), this.sourceObject.getGuid());
                }

                mx.data.action({
                    actionname : mf,
                    context    : context,
                    store: {
                      caller: this.mxform
                    },
                    callback   : function() {
                        // ok
                    },
                    error      : function() {
                        // error
                    }
                });
            }
        },

        // TODO: Recheck in 3.0
        matchTokens : function(str, mendixguid){
            logger.debug(this.id + ".matchTokens");
            var newstr = "";
            if (str !== null && str !== "") {
              newstr = str.match(/\[%CurrentObject%\]/) !== null ? str.replace(/\[%CurrentObject%\]/g, mendixguid) : str;
            }
            return newstr;
        },

        // TODO: use xpath from source
        getGuid : function(callback) {
            logger.debug(this.id + ".getGuid", callback);

            var value = this.comboBox.attr("value"),
                item  = this.comboBox.item;

            if (item) { // we already have an object
                callback(item.getGuid());
            } else if (value !== "") { // find an object that meets our requirements
                var attr   = this.objattribute,
                    method = this.fetchmethod == "startswith" ? "starts-with" : this.fetchmethod,
                    constr = "[" + method + "(" + attr + ",'" + value + "')";

                constr += method == "starts-with" ? " or " + attr + "='" + value + "']" : "]";

                var xpath = "//" + this.referredEntity + this.currentConstr + constr;

                mx.data.get({
                    xpath  : xpath,
                    filter : {
                        limit : 2 // then we know if there is more than one object meeting the constraint
                    },
                    callback : function(objs) {
                        if (objs.length == 1) {
                            callback(objs[0].getGuid());
                        } else {
                            logger.warn(this.id + ".onBlur: There is more than one object found, so change is ignored");

                            this.setDisplayValue("");
                            callback("");
                        }
                    },
                    error : function() {
                        // error
                    }
                }, this);
            } else {
                callback("");
            }
        },

        _setDisabledAttr : function(value) {
            console.log(this.id + "._setDisabledAttr");

            this.isInactive = !!value;
            this.comboBox.attr("disabled", this.isInactive);
        },

        uninitialize : function() {
            logger.debug(this.id + ".uninitialize");

            this.comboBox.destroyRecursive();
        }

    });
});
