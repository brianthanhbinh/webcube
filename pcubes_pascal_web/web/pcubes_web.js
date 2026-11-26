var pas = { $libimports: {}};

var rtl = {

  version: 20301,

  quiet: false,
  debug_load_units: false,
  debug_rtti: false,

  $res : {},

  debug: function(){
    if (rtl.quiet || !console || !console.log) return;
    console.log(arguments);
  },

  error: function(s){
    rtl.debug('Error: ',s);
    throw s;
  },

  warn: function(s){
    rtl.debug('Warn: ',s);
  },

  checkVersion: function(v){
    if (rtl.version != v) throw "expected rtl version "+v+", but found "+rtl.version;
  },

  hiInt: Math.pow(2,53),

  hasString: function(s){
    return rtl.isString(s) && (s.length>0);
  },

  isArray: function(a) {
    return Array.isArray(a);
  },

  isFunction: function(f){
    return typeof(f)==="function";
  },

  isModule: function(m){
    return rtl.isObject(m) && rtl.hasString(m.$name) && (pas[m.$name]===m);
  },

  isImplementation: function(m){
    return rtl.isObject(m) && rtl.isModule(m.$module) && (m.$module.$impl===m);
  },

  isNumber: function(n){
    return typeof(n)==="number";
  },

  isObject: function(o){
    var s=typeof(o);
    return (typeof(o)==="object") && (o!=null);
  },

  isString: function(s){
    return typeof(s)==="string";
  },

  getNumber: function(n){
    return typeof(n)==="number"?n:NaN;
  },

  getChar: function(c){
    return ((typeof(c)==="string") && (c.length===1)) ? c : "";
  },

  getObject: function(o){
    return ((typeof(o)==="object") || (typeof(o)==='function')) ? o : null;
  },

  isTRecord: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$new') && (typeof(type.$new)==='function'));
  },

  isPasClass: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$classname') && rtl.isObject(type.$module));
  },

  isPasClassInstance: function(type){
    return (rtl.isObject(type) && rtl.isPasClass(type.$class));
  },

  hexStr: function(n,digits){
    return ("000000000000000"+n.toString(16).toUpperCase()).slice(-digits);
  },

  m_loading: 0,
  m_loading_intf: 1,
  m_intf_loaded: 2,
  m_loading_impl: 3, // loading all used unit
  m_initializing: 4, // running initialization
  m_initialized: 5,

  module: function(module_name, intfuseslist, intfcode, impluseslist){
    if (rtl.debug_load_units) rtl.debug('rtl.module name="'+module_name+'" intfuses='+intfuseslist+' impluses='+impluseslist);
    if (!rtl.hasString(module_name)) rtl.error('invalid module name "'+module_name+'"');
    if (!rtl.isArray(intfuseslist)) rtl.error('invalid interface useslist of "'+module_name+'"');
    if (!rtl.isFunction(intfcode)) rtl.error('invalid interface code of "'+module_name+'"');
    if (!(impluseslist==undefined) && !rtl.isArray(impluseslist)) rtl.error('invalid implementation useslist of "'+module_name+'"');

    if (pas[module_name])
      rtl.error('module "'+module_name+'" is already registered');

    var r = Object.create(rtl.tSectionRTTI);
    var module = r.$module = pas[module_name] = {
      $name: module_name,
      $intfuseslist: intfuseslist,
      $impluseslist: impluseslist,
      $state: rtl.m_loading,
      $intfcode: intfcode,
      $implcode: null,
      $impl: null,
      $rtti: r
    };
    if (impluseslist) module.$impl = {
          $module: module,
          $rtti: r
        };
  },

  exitcode: 0,

  run: function(module_name){
    try {
      if (!rtl.hasString(module_name)) module_name='program';
      if (rtl.debug_load_units) rtl.debug('rtl.run module="'+module_name+'"');
      rtl.initRTTI();
      var module = pas[module_name];
      if (!module) rtl.error('rtl.run module "'+module_name+'" missing');
      rtl.loadintf(module);
      rtl.loadimpl(module);
      if ((module_name=='program') || (module_name=='library')){
        if (rtl.debug_load_units) rtl.debug('running $main');
        var r = pas[module_name].$main();
        if (rtl.isNumber(r)) rtl.exitcode = r;
      }
    } catch(re) {
      if (!rtl.showUncaughtExceptions) {
        throw re
      } else {  
        if (!rtl.handleUncaughtException(re)) {
          rtl.showException(re);
          rtl.exitcode = 216;
        }  
      }
    } 
    return rtl.exitcode;
  },
  
  showException : function (re) {
    var errMsg = rtl.hasString(re.$classname) ? re.$classname : '';
    errMsg +=  ((errMsg) ? ': ' : '') + (re.hasOwnProperty('fMessage') ? re.fMessage : re);
    alert('Uncaught Exception : '+errMsg);
  },

  handleUncaughtException: function (e) {
    if (rtl.onUncaughtException) {
      try {
        rtl.onUncaughtException(e);
        return true;
      } catch (ee) {
        return false; 
      }
    } else {
      return false;
    }
  },

  loadintf: function(module){
    if (module.$state>rtl.m_loading_intf) return; // already finished
    if (rtl.debug_load_units) rtl.debug('loadintf: "'+module.$name+'"');
    if (module.$state===rtl.m_loading_intf)
      rtl.error('unit cycle detected "'+module.$name+'"');
    module.$state=rtl.m_loading_intf;
    // load interfaces of interface useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadintf);
    // run interface
    if (rtl.debug_load_units) rtl.debug('loadintf: run intf of "'+module.$name+'"');
    module.$intfcode(module.$intfuseslist);
    // success
    module.$state=rtl.m_intf_loaded;
    // Note: units only used in implementations are not yet loaded (not even their interfaces)
  },

  loaduseslist: function(module,useslist,f){
    if (useslist==undefined) return;
    var len = useslist.length;
    for (var i = 0; i<len; i++) {
      var unitname=useslist[i];
      if (rtl.debug_load_units) rtl.debug('loaduseslist of "'+module.$name+'" uses="'+unitname+'"');
      if (pas[unitname]==undefined)
        rtl.error('module "'+module.$name+'" misses "'+unitname+'"');
      f(pas[unitname]);
    }
  },

  loadimpl: function(module){
    if (module.$state>=rtl.m_loading_impl) return; // already processing
    if (module.$state<rtl.m_intf_loaded) rtl.error('loadimpl: interface not loaded of "'+module.$name+'"');
    if (rtl.debug_load_units) rtl.debug('loadimpl: load uses of "'+module.$name+'"');
    module.$state=rtl.m_loading_impl;
    // load interfaces of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadintf);
    // load implementation of interfaces useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadimpl);
    // load implementation of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadimpl);
    // Note: At this point all interfaces used by this unit are loaded. If
    //   there are implementation uses cycles some used units might not yet be
    //   initialized. This is by design.
    // run implementation
    if (rtl.debug_load_units) rtl.debug('loadimpl: run impl of "'+module.$name+'"');
    if (rtl.isFunction(module.$implcode)) module.$implcode(module.$impluseslist);
    // run initialization
    if (rtl.debug_load_units) rtl.debug('loadimpl: run init of "'+module.$name+'"');
    module.$state=rtl.m_initializing;
    if (rtl.isFunction(module.$init)) module.$init();
    // unit initialized
    module.$state=rtl.m_initialized;
  },

  createCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        return scope[fn].apply(scope,arguments);
      };
    } else {
      cb = function(){
        return fn.apply(scope,arguments);
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  createSafeCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        try{
          return scope[fn].apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    } else {
      cb = function(){
        try{
          return fn.apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  eqCallback: function(a,b){
    // can be a function or a function wrapper
    if (a===b){
      return true;
    } else {
      return (a!=null) && (b!=null) && (a.fn) && (a.scope===b.scope) && (a.fn===b.fn);
    }
  },

  initStruct: function(c,parent,name){
    if ((parent.$module) && (parent.$module.$impl===parent)) parent=parent.$module;
    c.$parent = parent;
    if (rtl.isModule(parent)){
      c.$module = parent;
      c.$name = name;
    } else {
      c.$module = parent.$module;
      c.$name = parent.$name+'.'+name;
    };
    return parent;
  },

  initClass: function(c,parent,name,initfn,rttiname){
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    if (rtl.debug_rtti) rtl.debug('initClass '+c.$fullname);
    var t = c.$module.$rtti.$Class(c.$classname,{ "class": c });
    c.$rtti = t;
    if (rtl.isObject(c.$ancestor)) t.ancestor = c.$ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  createClass: function(parent,name,ancestor,initfn,rttiname){
    // create a normal class,
    // ancestor must be null or a normal class,
    // the root ancestor can be an external class
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // Note:
      // if root is an "object" then c.$ancestor === Object.getPrototypeOf(c)
      // if root is a "function" then c.$ancestor === c.__proto__, Object.getPrototypeOf(c) returns the root
    } else {
      c = { $ancestor: null };
      c.$create = function(fn,args){
        if (args == undefined) args = [];
        var o = Object.create(this);
        o.$init();
        try{
          if (typeof(fn)==="string"){
            o[fn].apply(o,args);
          } else {
            fn.apply(o,args);
          };
          o.AfterConstruction();
        } catch($e){
          // do not call BeforeDestruction
          if (o.Destroy) o.Destroy();
          o.$final();
          throw $e;
        }
        return o;
      };
      c.$destroy = function(fnname){
        this.BeforeDestruction();
        if (this[fnname]) this[fnname]();
        this.$final();
      };
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
  },

  createClassExt: function(parent,name,ancestor,newinstancefnname,initfn,rttiname){
    // Create a class using an external ancestor.
    // If newinstancefnname is given, use that function to create the new object.
    // If exist call BeforeDestruction and AfterConstruction.
    var isFunc = rtl.isFunction(ancestor);
    var c = null;
    if (isFunc){
      // create pascal class descendent from JS function
      c = Object.create(ancestor.prototype);
      c.$ancestorfunc = ancestor;
      c.$ancestor = null; // no pascal ancestor
    } else if (ancestor.$func){
      // create pascal class descendent from a pascal class descendent of a JS function
      isFunc = true;
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
    } else {
      c = Object.create(ancestor);
      c.$ancestor = null; // no pascal ancestor
    }
    c.$create = function(fn,args){
      if (args == undefined) args = [];
      var o = null;
      if (newinstancefnname.length>0){
        o = this[newinstancefnname](fn,args);
      } else if(isFunc) {
        o = new this.$func(args);
      } else {
        o = Object.create(c);
      }
      if (o.$init) o.$init();
      try{
        if (typeof(fn)==="string"){
          this[fn].apply(o,args);
        } else {
          fn.apply(o,args);
        };
        if (o.AfterConstruction) o.AfterConstruction();
      } catch($e){
        // do not call BeforeDestruction
        if (o.Destroy) o.Destroy();
        if (o.$final) o.$final();
        throw $e;
      }
      return o;
    };
    c.$destroy = function(fnname){
      if (this.BeforeDestruction) this.BeforeDestruction();
      if (this[fnname]) this[fnname]();
      if (this.$final) this.$final();
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
    if (isFunc){
      function f(){}
      f.prototype = c;
      c.$func = f;
    }
  },

  createHelper: function(parent,name,ancestor,initfn,rttiname){
    // create a helper,
    // ancestor must be null or a helper,
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // c.$ancestor === Object.getPrototypeOf(c)
    } else {
      c = { $ancestor: null };
    };
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    var t = c.$module.$rtti.$Helper(c.$classname,{ "helper": c });
    c.$rtti = t;
    if (rtl.isObject(ancestor)) t.ancestor = ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  tObjectDestroy: "Destroy",

  free: function(obj,name){
    if (obj[name]==null) return null;
    obj[name].$destroy(rtl.tObjectDestroy);
    obj[name]=null;
  },

  freeLoc: function(obj){
    if (obj==null) return null;
    obj.$destroy(rtl.tObjectDestroy);
    return null;
  },

  hideProp: function(o,p,v){
    Object.defineProperty(o,p, {
      enumerable: false,
      configurable: true,
      writable: true
    });
    if(arguments.length>2){ o[p]=v; }
  },

  recNewT: function(parent,name,initfn,full){
    // create new record type
    var t = {};
    if (parent) parent[name] = t;
    var h = rtl.hideProp;
    if (full){
      rtl.initStruct(t,parent,name);
      t.$record = t;
      h(t,'$record');
      h(t,'$name');
      h(t,'$parent');
      h(t,'$module');
      h(t,'$initSpec');
    }
    initfn.call(t);
    if (!t.$new){
      t.$new = function(){ return Object.create(t); };
    }
    t.$clone = function(r){ return t.$new().$assign(r); };
    h(t,'$new');
    h(t,'$clone');
    h(t,'$eq');
    h(t,'$assign');
    return t;
  },

  is: function(instance,type){
    return type.isPrototypeOf(instance) || (instance===type);
  },

  isExt: function(instance,type,mode){
    // mode===1 means instance must be a Pascal class instance
    // mode===2 means instance must be a Pascal class
    // Notes:
    // isPrototypeOf and instanceof return false on equal
    // isPrototypeOf does not work for Date.isPrototypeOf(new Date())
    //   so if isPrototypeOf is false test with instanceof
    // instanceof needs a function on right side
    if (instance == null) return false; // Note: ==null checks for undefined too
    if ((typeof(type) !== 'object') && (typeof(type) !== 'function')) return false;
    if (instance === type){
      if (mode===1) return false;
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if (type.isPrototypeOf && type.isPrototypeOf(instance)){
      if (mode===1) return rtl.isPasClassInstance(instance);
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if ((typeof type == 'function') && (instance instanceof type)) return true;
    return false;
  },

  Exception: null,
  EInvalidCast: null,
  EAbstractError: null,
  ERangeError: null,
  EIntOverflow: null,
  EPropWriteOnly: null,

  raiseE: function(typename){
    var t = rtl[typename];
    if (t==null){
      var mod = pas.SysUtils;
      if (!mod) mod = pas.sysutils;
      if (mod){
        t = mod[typename];
        if (!t) t = mod[typename.toLowerCase()];
        if (!t) t = mod['Exception'];
        if (!t) t = mod['exception'];
      }
    }
    if (t){
      if (t.Create){
        throw t.$create("Create");
      } else if (t.create){
        throw t.$create("create");
      }
    }
    if (typename === "EInvalidCast") throw "invalid type cast";
    if (typename === "EAbstractError") throw "Abstract method called";
    if (typename === "ERangeError") throw "range error";
    throw typename;
  },

  as: function(instance,type){
    if((instance === null) || rtl.is(instance,type)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  asExt: function(instance,type,mode){
    if((instance === null) || rtl.isExt(instance,type,mode)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  createInterface: function(module, name, guid, fnnames, ancestor, initfn, rttiname){
    //console.log('createInterface name="'+name+'" guid="'+guid+'" names='+fnnames);
    var i = ancestor?Object.create(ancestor):{};
    module[name] = i;
    i.$module = module;
    i.$name = rttiname?rttiname:name;
    i.$fullname = module.$name+'.'+i.$name;
    i.$guid = guid;
    i.$guidr = null;
    i.$names = fnnames?fnnames:[];
    if (rtl.isFunction(initfn)){
      // rtti
      if (rtl.debug_rtti) rtl.debug('createInterface '+i.$fullname);
      var t = i.$module.$rtti.$Interface(i.$name,{ "interface": i, module: module });
      i.$rtti = t;
      if (ancestor) t.ancestor = ancestor.$rtti;
      if (!t.ancestor) t.ancestor = null;
      initfn.call(i);
    }
    return i;
  },

  strToGUIDR: function(s,g){
    var p = 0;
    function n(l){
      var h = s.substr(p,l);
      p+=l;
      return parseInt(h,16);
    }
    p+=1; // skip {
    g.D1 = n(8);
    p+=1; // skip -
    g.D2 = n(4);
    p+=1; // skip -
    g.D3 = n(4);
    p+=1; // skip -
    if (!g.D4) g.D4=[];
    g.D4[0] = n(2);
    g.D4[1] = n(2);
    p+=1; // skip -
    for(var i=2; i<8; i++) g.D4[i] = n(2);
    return g;
  },

  guidrToStr: function(g){
    if (g.$intf) return g.$intf.$guid;
    var h = rtl.hexStr;
    var s='{'+h(g.D1,8)+'-'+h(g.D2,4)+'-'+h(g.D3,4)+'-'+h(g.D4[0],2)+h(g.D4[1],2)+'-';
    for (var i=2; i<8; i++) s+=h(g.D4[i],2);
    s+='}';
    return s;
  },

  createTGUID: function(guid){
    var TGuid = (pas.System)?pas.System.TGuid:pas.system.tguid;
    var g = rtl.strToGUIDR(guid,TGuid.$new());
    return g;
  },

  getIntfGUIDR: function(intfTypeOrVar){
    if (!intfTypeOrVar) return null;
    if (!intfTypeOrVar.$guidr){
      var g = rtl.createTGUID(intfTypeOrVar.$guid);
      if (!intfTypeOrVar.hasOwnProperty('$guid')) intfTypeOrVar = Object.getPrototypeOf(intfTypeOrVar);
      g.$intf = intfTypeOrVar;
      intfTypeOrVar.$guidr = g;
    }
    return intfTypeOrVar.$guidr;
  },

  addIntf: function (aclass, intf, map){
    function jmp(fn){
      if (typeof(fn)==="function"){
        return function(){ return fn.apply(this.$o,arguments); };
      } else {
        return function(){ rtl.raiseE('EAbstractError'); };
      }
    }
    if(!map) map = {};
    var t = intf;
    var item = Object.create(t);
    if (!aclass.hasOwnProperty('$intfmaps')) aclass.$intfmaps = {};
    aclass.$intfmaps[intf.$guid] = item;
    do{
      var names = t.$names;
      if (!names) break;
      for (var i=0; i<names.length; i++){
        var intfname = names[i];
        var fnname = map[intfname];
        if (!fnname) fnname = intfname;
        //console.log('addIntf: intftype='+t.$name+' index='+i+' intfname="'+intfname+'" fnname="'+fnname+'" old='+typeof(item[intfname]));
        item[intfname] = jmp(aclass[fnname]);
      }
      t = Object.getPrototypeOf(t);
    }while(t!=null);
  },

  getIntfG: function (obj, guid, query){
    if (!obj) return null;
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query);
    // search
    var maps = obj.$intfmaps;
    if (!maps) return null;
    var item = maps[guid];
    if (!item) return null;
    // check delegation
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query+' item='+typeof(item));
    if (typeof item === 'function') return item.call(obj); // delegate. Note: COM contains _AddRef
    // check cache
    var intf = null;
    if (obj.$interfaces){
      intf = obj.$interfaces[guid];
      //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' cache='+typeof(intf));
    }
    if (!intf){ // intf can be undefined!
      intf = Object.create(item);
      intf.$o = obj;
      if (!obj.$interfaces) obj.$interfaces = {};
      obj.$interfaces[guid] = intf;
    }
    if (typeof(query)==='object'){
      // called by queryIntfT
      var o = null;
      if (intf.QueryInterface(rtl.getIntfGUIDR(query),
          {get:function(){ return o; }, set:function(v){ o=v; }}) === 0){
        return o;
      } else {
        return null;
      }
    } else if(query===2){
      // called by TObject.GetInterfaceByStr
      if (intf.$kind === 'com') intf._AddRef();
    }
    return intf;
  },

  getIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid);
  },

  queryIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid,intftype);
  },

  queryIntfIsT: function(obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (!i) return false;
    if (i.$kind === 'com') i._Release();
    return true;
  },

  asIntfT: function (obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (i!==null) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsIntfT: function(intf,intftype){
    return (intf!==null) && rtl.queryIntfIsT(intf.$o,intftype);
  },

  intfAsIntfT: function (intf,intftype){
    if (!intf) return null;
    var i = rtl.getIntfG(intf.$o,intftype.$guid);
    if (i) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsClass: function(intf,classtype){
    return (intf!=null) && (rtl.is(intf.$o,classtype));
  },

  intfAsClass: function(intf,classtype){
    if (intf==null) return null;
    return rtl.as(intf.$o,classtype);
  },

  intfToClass: function(intf,classtype){
    if ((intf!==null) && rtl.is(intf.$o,classtype)) return intf.$o;
    return null;
  },

  // interface reference counting
  intfRefs: { // base object for temporary interface variables
    ref: function(id,intf){
      // called for temporary interface references needing delayed release
      var old = this[id];
      //console.log('rtl.intfRefs.ref: id='+id+' old="'+(old?old.$name:'null')+'" intf="'+(intf?intf.$name:'null')+' $o='+(intf?intf.$o:'null'));
      if (old){
        // called again, e.g. in a loop
        delete this[id];
        old._Release(); // may fail
      }
      if(intf) {
        this[id]=intf;
      }
      return intf;
    },
    free: function(){
      //console.log('rtl.intfRefs.free...');
      for (var id in this){
        if (this.hasOwnProperty(id)){
          var intf = this[id];
          if (intf){
            //console.log('rtl.intfRefs.free: id='+id+' '+intf.$name+' $o='+intf.$o.$classname);
            intf._Release();
          }
        }
      }
    }
  },

  createIntfRefs: function(){
    //console.log('rtl.createIntfRefs');
    return Object.create(rtl.intfRefs);
  },

  setIntfP: function(path,name,value,skipAddRef){
    var old = path[name];
    //console.log('rtl.setIntfP path='+path+' name='+name+' old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old === value) return;
    if (old !== null){
      path[name]=null;
      old._Release();
    }
    if (value !== null){
      if (!skipAddRef) value._AddRef();
      path[name]=value;
    }
  },

  setIntfL: function(old,value,skipAddRef){
    //console.log('rtl.setIntfL old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old !== value){
      if (value!==null){
        if (!skipAddRef) value._AddRef();
      }
      if (old!==null){
        old._Release();  // Release after AddRef, to avoid double Release if Release creates an exception
      }
    } else if (skipAddRef){
      if (old!==null){
        old._Release();  // value has an AddRef
      }
    }
    return value;
  },

  _AddRef: function(intf){
    //if (intf) console.log('rtl._AddRef intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._AddRef();
    return intf;
  },

  _Release: function(intf){
    //if (intf) console.log('rtl._Release intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._Release();
    return intf;
  },

  _ReleaseArray: function(a,dim){
    if (!a) return null;
    for (var i=0; i<a.length; i++){
      if (dim<=1){
        if (a[i]) a[i]._Release();
      } else {
        rtl._ReleaseArray(a[i],dim-1);
      }
    }
    return null;
  },

  trunc: function(a){
    return a<0 ? Math.ceil(a) : Math.floor(a);
  },

  checkMethodCall: function(obj,type){
    if (rtl.isObject(obj) && rtl.is(obj,type)) return;
    rtl.raiseE("EInvalidCast");
  },

  oc: function(i){
    // overflow check integer
    if ((Math.floor(i)===i) && (i>=-0x1fffffffffffff) && (i<=0x1fffffffffffff)) return i;
    rtl.raiseE('EIntOverflow');
  },

  rc: function(i,minval,maxval){
    // range check integer
    if ((Math.floor(i)===i) && (i>=minval) && (i<=maxval)) return i;
    rtl.raiseE('ERangeError');
  },

  rcc: function(c,minval,maxval){
    // range check char
    if ((typeof(c)==='string') && (c.length===1)){
      var i = c.charCodeAt(0);
      if ((i>=minval) && (i<=maxval)) return c;
    }
    rtl.raiseE('ERangeError');
  },

  rcSetCharAt: function(s,index,c){
    // range check setCharAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return rtl.setCharAt(s,index,c);
  },

  rcCharAt: function(s,index){
    // range check charAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return s.charAt(index);
  },

  rcArrR: function(arr,index){
    // range check read array
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      if (arguments.length>2){
        // arr,index1,index2,...
        arr=arr[index];
        for (var i=2; i<arguments.length; i++) arr=rtl.rcArrR(arr,arguments[i]);
        return arr;
      }
      return arr[index];
    }
    rtl.raiseE('ERangeError');
  },

  rcArrW: function(arr,index,value){
    // range check write array
    // arr,index1,index2,...,value
    for (var i=3; i<arguments.length; i++){
      arr=rtl.rcArrR(arr,index);
      index=arguments[i-1];
      value=arguments[i];
    }
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      return arr[index]=value;
    }
    rtl.raiseE('ERangeError');
  },

  length: function(arr){
    return (arr == null) ? 0 : arr.length;
  },

  arrayRef: function(a){
    if (a!=null) rtl.hideProp(a,'$pas2jsrefcnt',1);
    return a;
  },

  arraySetLength: function(arr,defaultvalue,newlength){
    var stack = [];
    var s = 9999;
    for (var i=2; i<arguments.length; i++){
      var j = arguments[i];
      if (j==='s'){ s = i-2; }
      else {
        stack.push({ dim:j+0, a:null, i:0, src:null });
      }
    }
    var dimmax = stack.length-1;
    var depth = 0;
    var lastlen = 0;
    var item = null;
    var a = null;
    var src = arr;
    var srclen = 0, oldlen = 0;
    do{
      if (depth>0){
        item=stack[depth-1];
        src = (item.src && item.src.length>item.i)?item.src[item.i]:null;
      }
      if (!src){
        a = [];
        srclen = 0;
        oldlen = 0;
      } else if (src.$pas2jsrefcnt>0 || depth>=s){
        a = [];
        srclen = src.length;
        oldlen = srclen;
      } else {
        a = src;
        srclen = 0;
        oldlen = a.length;
      }
      lastlen = stack[depth].dim;
      a.length = lastlen;
      if (depth>0){
        item.a[item.i]=a;
        item.i++;
        if ((lastlen===0) && (item.i<item.a.length)) continue;
      }
      if (lastlen>0){
        if (depth<dimmax){
          item = stack[depth];
          item.a = a;
          item.i = 0;
          item.src = src;
          depth++;
          continue;
        } else {
          if (srclen>lastlen) srclen=lastlen;
          if (rtl.isArray(defaultvalue)){
            // array of dyn array
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<lastlen; i++) a[i]=[];
          } else if (rtl.isObject(defaultvalue)) {
            if (rtl.isTRecord(defaultvalue)){
              // array of record
              for (var i=0; i<srclen; i++) a[i]=defaultvalue.$clone(src[i]);
              for (var i=oldlen; i<lastlen; i++) a[i]=defaultvalue.$new();
            } else {
              // array of set
              for (var i=0; i<srclen; i++) a[i]=rtl.refSet(src[i]);
              for (var i=oldlen; i<lastlen; i++) a[i]={};
            }
          } else {
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<lastlen; i++) a[i]=defaultvalue;
          }
        }
      }
      // backtrack
      while ((depth>0) && (stack[depth-1].i>=stack[depth-1].dim)){
        depth--;
      };
      if (depth===0){
        if (dimmax===0) return a;
        return stack[0].a;
      }
    }while (true);
  },

  arrayEq: function(a,b){
    if (a===null) return b===null;
    if (b===null) return false;
    if (a.length!==b.length) return false;
    for (var i=0; i<a.length; i++) if (a[i]!==b[i]) return false;
    return true;
  },

  arrayClone: function(type,src,srcpos,endpos,dst,dstpos){
    // type: 0 for references, "refset" for calling refSet(), a function for new type()
    // src must not be null
    // This function does not range check.
    if(type === 'refSet') {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = rtl.refSet(src[srcpos]); // ref set
    } else if (type === 'slice'){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos].slice(0); // clone static array of simple types
    } else if (typeof(type)==='function'){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type(src[srcpos]); // clone function
    } else if (rtl.isTRecord(type)){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type.$clone(src[srcpos]); // clone record
    }  else {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos]; // reference
    };
  },

  arrayConcat: function(type){
    // type: see rtl.arrayClone
    var a = [];
    var l = 0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src !== null) l+=src.length;
    };
    a.length = l;
    l=0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      rtl.arrayClone(type,src,0,src.length,a,l);
      l+=src.length;
    };
    return a;
  },

  arrayConcatN: function(){
    var a = null;
    for (var i=0; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      if (a===null){
        a=rtl.arrayRef(src); // Note: concat(a) does not clone
      } else if (a['$pas2jsrefcnt']){
        a=a.concat(src); // clone a and append src
      } else {
        for (var i=0; i<src.length; i++){
          a.push(src[i]);
        }
      }
    };
    return a;
  },

  arrayPush: function(type,a){
    if(a===null){
      a=[];
    } else if (a['$pas2jsrefcnt']){
      a=rtl.arrayCopy(type,a,0,a.length);
    }
    rtl.arrayClone(type,arguments,2,arguments.length,a,a.length);
    return a;
  },

  arrayPushN: function(a){
    if(a===null){
      a=[];
    } else if (a['$pas2jsrefcnt']){
      a=a.concat();
    }
    for (var i=1; i<arguments.length; i++){
      a.push(arguments[i]);
    }
    return a;
  },

  arrayCopy: function(type, srcarray, index, count){
    // type: see rtl.arrayClone
    // if count is missing, use srcarray.length
    if (srcarray === null) return [];
    if (index < 0) index = 0;
    if (count === undefined) count=srcarray.length;
    var end = index+count;
    if (end>srcarray.length) end = srcarray.length;
    if (index>=end) return [];
    if (type===0){
      return srcarray.slice(index,end);
    } else {
      var a = [];
      a.length = end-index;
      rtl.arrayClone(type,srcarray,index,end,a,0);
      return a;
    }
  },

  arrayInsert: function(item, arr, index){
    if (arr){
      arr.splice(index,0,item);
      return arr;
    } else {
      return [item];
    }
  },

  setCharAt: function(s,index,c){
    return s.substr(0,index)+c+s.substr(index+1);
  },

  getResStr: function(mod,name){
    var rs = mod.$resourcestrings[name];
    return rs.current?rs.current:rs.org;
  },

  createSet: function(){
    var s = {};
    for (var i=0; i<arguments.length; i++){
      if (arguments[i]!=null){
        s[arguments[i]]=true;
      } else {
        var first=arguments[i+=1];
        var last=arguments[i+=1];
        for(var j=first; j<=last; j++) s[j]=true;
      }
    }
    return s;
  },

  cloneSet: function(s){
    var r = {};
    for (var key in s) r[key]=true;
    return r;
  },

  refSet: function(s){
    rtl.hideProp(s,'$shared',true);
    return s;
  },

  includeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    s[enumvalue] = true;
    return s;
  },

  excludeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    delete s[enumvalue];
    return s;
  },

  diffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    return r;
  },

  unionSet: function(s,t){
    var r = {};
    for (var key in s) r[key]=true;
    for (var key in t) r[key]=true;
    return r;
  },

  intersectSet: function(s,t){
    var r = {};
    for (var key in s) if (t[key]) r[key]=true;
    return r;
  },

  symDiffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    for (var key in t) if (!s[key]) r[key]=true;
    return r;
  },

  eqSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  neSet: function(s,t){
    return !rtl.eqSet(s,t);
  },

  leSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    return true;
  },

  geSet: function(s,t){
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  strSetLength: function(s,newlen){
    var oldlen = s.length;
    if (oldlen > newlen){
      return s.substring(0,newlen);
    } else if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return s+' '.repeat(newlen-oldlen);
    } else {
       while (oldlen<newlen){
         s+=' ';
         oldlen++;
       };
       return s;
    }
  },

  spaceLeft: function(s,width){
    var l=s.length;
    if (l>=width) return s;
    if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return ' '.repeat(width-l) + s;
    } else {
      while (l<width){
        s=' '+s;
        l++;
      };
      return s;
    };
  },

  floatToStr: function(d,w,p){
    // input 1-3 arguments: double, width, precision
    if (arguments.length>2){
      return rtl.spaceLeft(d.toFixed(p),w);
    } else {
	  // exponent width
	  var pad = "";
	  var ad = Math.abs(d);
	  if (((ad>1) && (ad<1.0e+10)) ||  ((ad>1.e-10) && (ad<1))) {
		pad='00';
	  } else if ((ad>1) && (ad<1.0e+100) || (ad<1.e-10)) {
		pad='0';
      }  	
	  if (arguments.length<2) {
	    w=24;		
      } else if (w<9) {
		w=9;
      }		  
      var p = w-8;
      var s=(d>0 ? " " : "" ) + d.toExponential(p);
      s=s.replace(/e(.)/,'E$1'+pad);
      return rtl.spaceLeft(s,w);
    }
  },

  valEnum: function(s, enumType, setCodeFn){
    s = s.toLowerCase();
    for (var key in enumType){
      if((typeof(key)==='string') && (key.toLowerCase()===s)){
        setCodeFn(0);
        return enumType[key];
      }
    }
    setCodeFn(1);
    return 0;
  },

  lw: function(l){
    // fix longword bitwise operation
    return l<0?l+0x100000000:l;
  },

  and: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) & (b / hi);
    var l = (a & low) & (b & low);
    return h*hi + l;
  },

  or: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) | (b / hi);
    var l = (a & low) | (b & low);
    return h*hi + l;
  },

  xor: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) ^ (b / hi);
    var l = (a & low) ^ (b & low);
    return h*hi + l;
  },

  shr: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (a<0x80000000) return a >> b;
    if (b<=0) return a;
    if (b>54) return 0;
    return Math.floor(a / Math.pow(2,b));
  },

  shl: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (b<=0) return a;
    if (b>54) return 0;
    var r = a * Math.pow(2,b);
    if (r <= rtl.hiInt) return r;
    return r % rtl.hiInt;
  },

  initRTTI: function(){
    if (rtl.debug_rtti) rtl.debug('initRTTI');

    // base types
    rtl.tTypeInfo = { name: "tTypeInfo", kind: 0, $module: null, attr: null };
    function newBaseTI(name,kind,ancestor){
      if (!ancestor) ancestor = rtl.tTypeInfo;
      if (rtl.debug_rtti) rtl.debug('initRTTI.newBaseTI "'+name+'" '+kind+' ("'+ancestor.name+'")');
      var t = Object.create(ancestor);
      t.name = name;
      t.kind = kind;
      rtl[name] = t;
      return t;
    };
    function newBaseInt(name,minvalue,maxvalue,ordtype){
      var t = newBaseTI(name,1 /* tkInteger */,rtl.tTypeInfoInteger);
      t.minvalue = minvalue;
      t.maxvalue = maxvalue;
      t.ordtype = ordtype;
      return t;
    };
    newBaseTI("tTypeInfoInteger",1 /* tkInteger */);
    newBaseInt("shortint",-0x80,0x7f,0);
    newBaseInt("byte",0,0xff,1);
    newBaseInt("smallint",-0x8000,0x7fff,2);
    newBaseInt("word",0,0xffff,3);
    newBaseInt("longint",-0x80000000,0x7fffffff,4);
    newBaseInt("longword",0,0xffffffff,5);
    newBaseInt("nativeint",-0x10000000000000,0xfffffffffffff,6);
    newBaseInt("nativeuint",0,0xfffffffffffff,7);
    newBaseTI("char",2 /* tkChar */);
    newBaseTI("string",3 /* tkString */);
    newBaseTI("tTypeInfoEnum",4 /* tkEnumeration */,rtl.tTypeInfoInteger);
    newBaseTI("tTypeInfoSet",5 /* tkSet */);
    newBaseTI("double",6 /* tkDouble */);
    newBaseTI("boolean",7 /* tkBool */);
    newBaseTI("tTypeInfoProcVar",8 /* tkProcVar */);
    newBaseTI("tTypeInfoMethodVar",9 /* tkMethod */,rtl.tTypeInfoProcVar);
    newBaseTI("tTypeInfoArray",10 /* tkArray */);
    newBaseTI("tTypeInfoDynArray",11 /* tkDynArray */);
    newBaseTI("tTypeInfoPointer",15 /* tkPointer */);
    var t = newBaseTI("pointer",15 /* tkPointer */,rtl.tTypeInfoPointer);
    t.reftype = null;
    newBaseTI("jsvalue",16 /* tkJSValue */);
    newBaseTI("tTypeInfoRefToProcVar",17 /* tkRefToProcVar */,rtl.tTypeInfoProcVar);

    // member kinds
    rtl.tTypeMember = { attr: null };
    function newMember(name,kind){
      var m = Object.create(rtl.tTypeMember);
      m.name = name;
      m.kind = kind;
      rtl[name] = m;
    };
    newMember("tTypeMemberField",1); // tmkField
    newMember("tTypeMemberMethod",2); // tmkMethod
    newMember("tTypeMemberProperty",3); // tmkProperty

    // base object for storing members: a simple object
    rtl.tTypeMembers = {};

    // tTypeInfoStruct - base object for tTypeInfoClass, tTypeInfoRecord, tTypeInfoInterface
    var tis = newBaseTI("tTypeInfoStruct",0);
    tis.$addMember = function(name,ancestor,options){
      if (rtl.debug_rtti){
        if (!rtl.hasString(name) || (name.charAt()==='$')) throw 'invalid member "'+name+'", this="'+this.name+'"';
        if (!rtl.is(ancestor,rtl.tTypeMember)) throw 'invalid ancestor "'+ancestor+':'+ancestor.name+'", "'+this.name+'.'+name+'"';
        if ((options!=undefined) && (typeof(options)!='object')) throw 'invalid options "'+options+'", "'+this.name+'.'+name+'"';
      };
      var t = Object.create(ancestor);
      t.name = name;
      this.members[name] = t;
      this.names.push(name);
      if (rtl.isObject(options)){
        for (var key in options) if (options.hasOwnProperty(key)) t[key] = options[key];
      };
      return t;
    };
    tis.addField = function(name,type,options){
      var t = this.$addMember(name,rtl.tTypeMemberField,options);
      if (rtl.debug_rtti){
        if (!rtl.is(type,rtl.tTypeInfo)) throw 'invalid type "'+type+'", "'+this.name+'.'+name+'"';
      };
      t.typeinfo = type;
      this.fields.push(name);
      return t;
    };
    tis.addFields = function(){
      var i=0;
      while(i<arguments.length){
        var name = arguments[i++];
        var type = arguments[i++];
        if ((i<arguments.length) && (typeof(arguments[i])==='object')){
          this.addField(name,type,arguments[i++]);
        } else {
          this.addField(name,type);
        };
      };
    };
    tis.addMethod = function(name,methodkind,params,result,flags,options){
      var t = this.$addMember(name,rtl.tTypeMemberMethod,options);
      t.methodkind = methodkind;
      t.procsig = rtl.newTIProcSig(params,result,flags);
      this.methods.push(name);
      return t;
    };
    tis.addProperty = function(name,flags,result,getter,setter,options){
      var t = this.$addMember(name,rtl.tTypeMemberProperty,options);
      t.flags = flags;
      t.typeinfo = result;
      t.getter = getter;
      t.setter = setter;
      // Note: in options: params, stored, defaultvalue
      t.params = rtl.isArray(t.params) ? rtl.newTIParams(t.params) : null;
      this.properties.push(name);
      if (!rtl.isString(t.stored)) t.stored = "";
      return t;
    };
    tis.getField = function(index){
      return this.members[this.fields[index]];
    };
    tis.getMethod = function(index){
      return this.members[this.methods[index]];
    };
    tis.getProperty = function(index){
      return this.members[this.properties[index]];
    };

    newBaseTI("tTypeInfoRecord",12 /* tkRecord */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClass",13 /* tkClass */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClassRef",14 /* tkClassRef */);
    newBaseTI("tTypeInfoInterface",18 /* tkInterface */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoHelper",19 /* tkHelper */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoExtClass",20 /* tkExtClass */,rtl.tTypeInfoClass);
  },

  tSectionRTTI: {
    $module: null,
    $inherited: function(name,ancestor,o){
      if (rtl.debug_rtti){
        rtl.debug('tSectionRTTI.newTI "'+(this.$module?this.$module.$name:"(no module)")
          +'"."'+name+'" ('+ancestor.name+') '+(o?'init':'forward'));
      };
      var t = this[name];
      if (t){
        if (!t.$forward) throw 'duplicate type "'+name+'"';
        if (!ancestor.isPrototypeOf(t)) throw 'typeinfo ancestor mismatch "'+name+'" ancestor="'+ancestor.name+'" t.name="'+t.name+'"';
      } else {
        t = Object.create(ancestor);
        t.name = name;
        t.$module = this.$module;
        this[name] = t;
      }
      if (o){
        delete t.$forward;
        for (var key in o) if (o.hasOwnProperty(key)) t[key]=o[key];
      } else {
        t.$forward = true;
      }
      return t;
    },
    $Scope: function(name,ancestor,o){
      var t=this.$inherited(name,ancestor,o);
      t.members = {};
      t.names = [];
      t.fields = [];
      t.methods = [];
      t.properties = [];
      return t;
    },
    $TI: function(name,kind,o){ var t=this.$inherited(name,rtl.tTypeInfo,o); t.kind = kind; return t; },
    $Int: function(name,o){ return this.$inherited(name,rtl.tTypeInfoInteger,o); },
    $Enum: function(name,o){ return this.$inherited(name,rtl.tTypeInfoEnum,o); },
    $Set: function(name,o){ return this.$inherited(name,rtl.tTypeInfoSet,o); },
    $StaticArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoArray,o); },
    $DynArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoDynArray,o); },
    $ProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoProcVar,o); },
    $RefToProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoRefToProcVar,o); },
    $MethodVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoMethodVar,o); },
    $Record: function(name,o){ return this.$Scope(name,rtl.tTypeInfoRecord,o); },
    $Class: function(name,o){ return this.$Scope(name,rtl.tTypeInfoClass,o); },
    $ClassRef: function(name,o){ return this.$inherited(name,rtl.tTypeInfoClassRef,o); },
    $Pointer: function(name,o){ return this.$inherited(name,rtl.tTypeInfoPointer,o); },
    $Interface: function(name,o){ return this.$Scope(name,rtl.tTypeInfoInterface,o); },
    $Helper: function(name,o){ return this.$Scope(name,rtl.tTypeInfoHelper,o); },
    $ExtClass: function(name,o){ return this.$Scope(name,rtl.tTypeInfoExtClass,o); }
  },

  newTIParam: function(param){
    // param is an array, 0=name, 1=type, 2=optional flags
    var t = {
      name: param[0],
      typeinfo: param[1],
      flags: (rtl.isNumber(param[2]) ? param[2] : 0)
    };
    return t;
  },

  newTIParams: function(list){
    // list: optional array of [paramname,typeinfo,optional flags]
    var params = [];
    if (rtl.isArray(list)){
      for (var i=0; i<list.length; i++) params.push(rtl.newTIParam(list[i]));
    };
    return params;
  },

  newTIProcSig: function(params,result,flags){
    var s = {
      params: rtl.newTIParams(params),
      resulttype: result?result:null,
      flags: flags?flags:0
    };
    return s;
  },

  addResource: function(aRes){
    rtl.$res[aRes.name]=aRes;
  },

  getResource: function(aName){
    var res = rtl.$res[aName];
    if (res !== undefined) {
      return res;
    } else {
      return null;
    }
  },

  getResourceList: function(){
    return Object.keys(rtl.$res);
  }
}

rtl.module("System",[],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.LineEnding = "\n";
  this.sLineBreak = this.LineEnding;
  this.MaxLongint = 0x7fffffff;
  this.Maxint = 2147483647;
  this.TTextLineBreakStyle = {"0": "tlbsLF", tlbsLF: 0, "1": "tlbsCRLF", tlbsCRLF: 1, "2": "tlbsCR", tlbsCR: 2};
  rtl.recNewT(this,"TGuid",function () {
    this.D1 = 0;
    this.D2 = 0;
    this.D3 = 0;
    this.$new = function () {
      var r = Object.create(this);
      r.D4 = rtl.arraySetLength(null,0,8);
      return r;
    };
    this.$eq = function (b) {
      return (this.D1 === b.D1) && (this.D2 === b.D2) && (this.D3 === b.D3) && rtl.arrayEq(this.D4,b.D4);
    };
    this.$assign = function (s) {
      this.D1 = s.D1;
      this.D2 = s.D2;
      this.D3 = s.D3;
      this.D4 = s.D4.slice(0);
      return this;
    };
  });
  rtl.createClass(this,"TObject",null,function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
    this.Create = function () {
      return this;
    };
    this.Destroy = function () {
    };
    this.Free = function () {
      this.$destroy("Destroy");
    };
    this.AfterConstruction = function () {
    };
    this.BeforeDestruction = function () {
    };
  });
  rtl.createInterface(this,"IUnknown","{00000000-0000-0000-C000-000000000046}",["QueryInterface","_AddRef","_Release"],null,function () {
    this.$kind = "com";
  });
  this.vtInteger = 0;
  this.vtExtended = 3;
  this.vtWideChar = 9;
  this.vtCurrency = 12;
  this.vtUnicodeString = 18;
  this.vtNativeInt = 19;
  rtl.recNewT(this,"TVarRec",function () {
    this.VType = 0;
    this.VJSValue = undefined;
    this.$eq = function (b) {
      return (this.VType === b.VType) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue) && (this.VJSValue === b.VJSValue);
    };
    this.$assign = function (s) {
      this.VType = s.VType;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      this.VJSValue = s.VJSValue;
      return this;
    };
  });
  this.VarRecs = function () {
    var Result = [];
    var i = 0;
    var v = null;
    Result = [];
    while (i < arguments.length) {
      v = $mod.TVarRec.$new();
      v.VType = rtl.trunc(arguments[i]);
      i += 1;
      v.VJSValue = arguments[i];
      i += 1;
      Result.push($mod.TVarRec.$clone(v));
    };
    return Result;
  };
  this.Random = function (Range) {
    return Math.floor(Math.random()*Range);
  };
  this.Sqr$1 = function (A) {
    return A*A;
  };
  this.Trunc = function (A) {
    if (!Math.trunc) {
      Math.trunc = function(v) {
        v = +v;
        if (!isFinite(v)) return v;
        return (v - v % 1) || (v < 0 ? -0 : v === 0 ? v : 0);
      };
    }
    $mod.Trunc = Math.trunc;
    return Math.trunc(A);
  };
  this.DefaultTextLineBreakStyle = this.TTextLineBreakStyle.tlbsLF;
  this.Int = function (A) {
    var Result = 0.0;
    Result = $mod.Trunc(A);
    return Result;
  };
  this.Copy = function (S, Index, Size) {
    if (Index<1) Index = 1;
    return (Size>0) ? S.substring(Index-1,Index+Size-1) : "";
  };
  this.Copy$1 = function (S, Index) {
    if (Index<1) Index = 1;
    return S.substr(Index-1);
  };
  this.Delete = function (S, Index, Size) {
    var h = "";
    if ((Index < 1) || (Index > S.get().length) || (Size <= 0)) return;
    h = S.get();
    S.set($mod.Copy(h,1,Index - 1) + $mod.Copy$1(h,Index + Size));
  };
  this.Pos = function (Search, InString) {
    return InString.indexOf(Search)+1;
  };
  this.Insert = function (Insertion, Target, Index) {
    var t = "";
    if (Insertion === "") return;
    t = Target.get();
    if (Index < 1) {
      Target.set(Insertion + t)}
     else if (Index > t.length) {
      Target.set(t + Insertion)}
     else Target.set($mod.Copy(t,1,Index - 1) + Insertion + $mod.Copy(t,Index,t.length));
  };
  this.upcase = function (c) {
    return c.toUpperCase();
  };
  this.val = function (S, NI, Code) {
    NI.set($impl.valint(S,-9007199254740991,9007199254740991,Code));
  };
  this.StringOfChar = function (c, l) {
    var Result = "";
    var i = 0;
    if ((l>0) && c.repeat) return c.repeat(l);
    Result = "";
    for (var $l = 1, $end = l; $l <= $end; $l++) {
      i = $l;
      Result = Result + c;
    };
    return Result;
  };
  this.Writeln = function () {
    var i = 0;
    var l = 0;
    var s = "";
    l = arguments.length - 1;
    if ($impl.WriteCallBack != null) {
      for (var $l = 0, $end = l; $l <= $end; $l++) {
        i = $l;
        $impl.WriteCallBack(arguments[i],i === l);
      };
    } else {
      s = $impl.WriteBuf;
      for (var $l1 = 0, $end1 = l; $l1 <= $end1; $l1++) {
        i = $l1;
        s = s + ("" + arguments[i]);
      };
      console.log(s);
      $impl.WriteBuf = "";
    };
  };
  $mod.$implcode = function () {
    $impl.WriteBuf = "";
    $impl.WriteCallBack = null;
    $impl.valint = function (S, MinVal, MaxVal, Code) {
      var Result = 0;
      var x = 0.0;
      if (S === "") {
        Code.set(1);
        return Result;
      };
      x = Number(S);
      if (isNaN(x)) {
        var $tmp = $mod.Copy(S,1,1);
        if ($tmp === "$") {
          x = Number("0x" + $mod.Copy$1(S,2))}
         else if ($tmp === "&") {
          x = Number("0o" + $mod.Copy$1(S,2))}
         else if ($tmp === "%") {
          x = Number("0b" + $mod.Copy$1(S,2))}
         else {
          Code.set(1);
          return Result;
        };
      };
      if (isNaN(x) || (x !== $mod.Int(x))) {
        Code.set(1)}
       else if ((x < MinVal) || (x > MaxVal)) {
        Code.set(2)}
       else {
        Result = $mod.Trunc(x);
        Code.set(0);
      };
      return Result;
    };
  };
  $mod.$init = function () {
    rtl.exitcode = 0;
  };
},[]);
rtl.module("Types",["System"],function () {
  "use strict";
  var $mod = this;
  this.TDuplicates = {"0": "dupIgnore", dupIgnore: 0, "1": "dupAccept", dupAccept: 1, "2": "dupError", dupError: 2};
});
rtl.module("JS",["System","Types"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"EJS",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FMessage = "";
    };
    this.Create$1 = function (Msg) {
      this.FMessage = Msg;
      return this;
    };
  });
  this.New = function (aElements) {
    var Result = null;
    var L = 0;
    var I = 0;
    var S = "";
    L = rtl.length(aElements);
    if ((L % 2) === 1) throw $mod.EJS.$create("Create$1",["Number of arguments must be even"]);
    I = 0;
    while (I < L) {
      if (!rtl.isString(aElements[I])) {
        S = String(I);
        throw $mod.EJS.$create("Create$1",["Argument " + S + " must be a string."]);
      };
      I += 2;
    };
    I = 0;
    Result = new Object();
    while (I < L) {
      S = "" + aElements[I];
      Result[S] = aElements[I + 1];
      I += 2;
    };
    return Result;
  };
  this.isBoolean = function (v) {
    return typeof(v) == 'boolean';
  };
  this.isNull = function (v) {
    return v === null;
  };
  this.isUndefined = function (v) {
    return v == undefined;
  };
  this.ToString = function (Value) {
    var Result = "";
    if (rtl.isString(Value)) {
      Result = "" + Value}
     else Result = "";
    return Result;
  };
});
rtl.module("weborworker",["System","JS","Types"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("Web",["System","Types","JS","weborworker"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("RTLConsts",["System"],function () {
  "use strict";
  var $mod = this;
  $mod.$resourcestrings = {SArgumentMissing: {org: 'Missing argument in format "%s"'}, SInvalidFormat: {org: 'Invalid format specifier : "%s"'}, SInvalidArgIndex: {org: 'Invalid argument index in format: "%s"'}, SListCapacityError: {org: "List capacity (%s) exceeded."}, SListIndexError: {org: "List index (%s) out of bounds"}, SSortedListError: {org: "Operation not allowed on sorted list"}, SDuplicateString: {org: "String list does not allow duplicates"}, SErrFindNeedsSortedList: {org: "Cannot use find on unsorted list"}, SErrInvalidInteger: {org: 'Invalid integer value: "%s"'}};
});
rtl.module("SysUtils",["System","RTLConsts","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.FreeAndNil = function (Obj) {
    var o = null;
    o = Obj.get();
    if (o === null) return;
    Obj.set(null);
    o.$destroy("Destroy");
  };
  rtl.recNewT(this,"TFormatSettings",function () {
    this.CurrencyDecimals = 0;
    this.CurrencyFormat = 0;
    this.CurrencyString = "";
    this.DateSeparator = "";
    this.DecimalSeparator = "";
    this.LongDateFormat = "";
    this.LongTimeFormat = "";
    this.NegCurrFormat = 0;
    this.ShortDateFormat = "";
    this.ShortTimeFormat = "";
    this.ThousandSeparator = "";
    this.TimeAMString = "";
    this.TimePMString = "";
    this.TimeSeparator = "";
    this.TwoDigitYearCenturyWindow = 0;
    this.InitLocaleHandler = null;
    this.$new = function () {
      var r = Object.create(this);
      r.DateTimeToStrFormat = rtl.arraySetLength(null,"",2);
      r.LongDayNames = rtl.arraySetLength(null,"",7);
      r.LongMonthNames = rtl.arraySetLength(null,"",12);
      r.ShortDayNames = rtl.arraySetLength(null,"",7);
      r.ShortMonthNames = rtl.arraySetLength(null,"",12);
      return r;
    };
    this.$eq = function (b) {
      return (this.CurrencyDecimals === b.CurrencyDecimals) && (this.CurrencyFormat === b.CurrencyFormat) && (this.CurrencyString === b.CurrencyString) && (this.DateSeparator === b.DateSeparator) && rtl.arrayEq(this.DateTimeToStrFormat,b.DateTimeToStrFormat) && (this.DecimalSeparator === b.DecimalSeparator) && (this.LongDateFormat === b.LongDateFormat) && rtl.arrayEq(this.LongDayNames,b.LongDayNames) && rtl.arrayEq(this.LongMonthNames,b.LongMonthNames) && (this.LongTimeFormat === b.LongTimeFormat) && (this.NegCurrFormat === b.NegCurrFormat) && (this.ShortDateFormat === b.ShortDateFormat) && rtl.arrayEq(this.ShortDayNames,b.ShortDayNames) && rtl.arrayEq(this.ShortMonthNames,b.ShortMonthNames) && (this.ShortTimeFormat === b.ShortTimeFormat) && (this.ThousandSeparator === b.ThousandSeparator) && (this.TimeAMString === b.TimeAMString) && (this.TimePMString === b.TimePMString) && (this.TimeSeparator === b.TimeSeparator) && (this.TwoDigitYearCenturyWindow === b.TwoDigitYearCenturyWindow);
    };
    this.$assign = function (s) {
      this.CurrencyDecimals = s.CurrencyDecimals;
      this.CurrencyFormat = s.CurrencyFormat;
      this.CurrencyString = s.CurrencyString;
      this.DateSeparator = s.DateSeparator;
      this.DateTimeToStrFormat = s.DateTimeToStrFormat.slice(0);
      this.DecimalSeparator = s.DecimalSeparator;
      this.LongDateFormat = s.LongDateFormat;
      this.LongDayNames = s.LongDayNames.slice(0);
      this.LongMonthNames = s.LongMonthNames.slice(0);
      this.LongTimeFormat = s.LongTimeFormat;
      this.NegCurrFormat = s.NegCurrFormat;
      this.ShortDateFormat = s.ShortDateFormat;
      this.ShortDayNames = s.ShortDayNames.slice(0);
      this.ShortMonthNames = s.ShortMonthNames.slice(0);
      this.ShortTimeFormat = s.ShortTimeFormat;
      this.ThousandSeparator = s.ThousandSeparator;
      this.TimeAMString = s.TimeAMString;
      this.TimePMString = s.TimePMString;
      this.TimeSeparator = s.TimeSeparator;
      this.TwoDigitYearCenturyWindow = s.TwoDigitYearCenturyWindow;
      return this;
    };
    this.GetJSLocale = function () {
      return Intl.DateTimeFormat().resolvedOptions().locale;
    };
    this.Create = function () {
      var Result = $mod.TFormatSettings.$new();
      Result.$assign($mod.TFormatSettings.Create$1($mod.TFormatSettings.GetJSLocale()));
      return Result;
    };
    this.Create$1 = function (ALocale) {
      var Result = $mod.TFormatSettings.$new();
      Result.LongDayNames = $impl.DefaultLongDayNames.slice(0);
      Result.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
      Result.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
      Result.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
      Result.DateTimeToStrFormat[0] = "c";
      Result.DateTimeToStrFormat[1] = "f";
      Result.DateSeparator = "-";
      Result.TimeSeparator = ":";
      Result.ShortDateFormat = "yyyy-mm-dd";
      Result.LongDateFormat = "ddd, yyyy-mm-dd";
      Result.ShortTimeFormat = "hh:nn";
      Result.LongTimeFormat = "hh:nn:ss";
      Result.DecimalSeparator = ".";
      Result.ThousandSeparator = ",";
      Result.TimeAMString = "AM";
      Result.TimePMString = "PM";
      Result.TwoDigitYearCenturyWindow = 50;
      Result.CurrencyFormat = 0;
      Result.NegCurrFormat = 0;
      Result.CurrencyDecimals = 2;
      Result.CurrencyString = "$";
      if ($mod.TFormatSettings.InitLocaleHandler != null) $mod.TFormatSettings.InitLocaleHandler($mod.UpperCase(ALocale),$mod.TFormatSettings.$clone(Result));
      return Result;
    };
  },true);
  rtl.createClass(this,"Exception",pas.System.TObject,function () {
    this.LogMessageOnCreate = false;
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.fMessage = "";
    };
    this.Create$1 = function (Msg) {
      this.fMessage = Msg;
      if (this.LogMessageOnCreate) pas.System.Writeln("Created exception ",this.$classname," with message: ",Msg);
      return this;
    };
    this.CreateFmt = function (Msg, Args) {
      this.Create$1($mod.Format(Msg,Args));
      return this;
    };
  });
  rtl.createClass(this,"EConvertError",this.Exception,function () {
  });
  rtl.createClass(this,"EArgumentException",this.Exception,function () {
  });
  rtl.createClass(this,"EArgumentOutOfRangeException",this.EArgumentException,function () {
  });
  this.Trim = function (S) {
    return S.replace(/^[\s\uFEFF\xA0\x00-\x1f]+/,'').replace(/[\s\uFEFF\xA0\x00-\x1f]+$/,'');
  };
  this.TrimLeft = function (S) {
    return S.replace(/^[\s\uFEFF\xA0\x00-\x1f]+/,'');
  };
  this.UpperCase = function (s) {
    return s.toUpperCase();
  };
  this.LowerCase = function (s) {
    return s.toLowerCase();
  };
  this.CompareStr = function (s1, s2) {
    var l1 = s1.length;
    var l2 = s2.length;
    if (l1<=l2){
      var s = s2.substr(0,l1);
      if (s1<s){ return -1;
      } else if (s1>s){ return 1;
      } else { return l1<l2 ? -1 : 0; };
    } else {
      var s = s1.substr(0,l2);
      if (s<s2){ return -1;
      } else { return 1; };
    };
  };
  this.CompareText = function (s1, s2) {
    var l1 = s1.toLowerCase();
    var l2 = s2.toLowerCase();
    if (l1>l2){ return 1;
    } else if (l1<l2){ return -1;
    } else { return 0; };
  };
  this.SameText = function (s1, s2) {
    return s1.toLowerCase() == s2.toLowerCase();
  };
  this.Format = function (Fmt, Args) {
    var Result = "";
    Result = $mod.Format$1(Fmt,Args,$mod.FormatSettings);
    return Result;
  };
  this.Format$1 = function (Fmt, Args, aSettings) {
    var Result = "";
    var ChPos = 0;
    var OldPos = 0;
    var ArgPos = 0;
    var DoArg = 0;
    var Len = 0;
    var Hs = "";
    var ToAdd = "";
    var Index = 0;
    var Width = 0;
    var Prec = 0;
    var Left = false;
    var Fchar = "";
    var vq = 0;
    function ReadFormat() {
      var Result = "";
      var Value = 0;
      function ReadInteger() {
        var Code = 0;
        var ArgN = 0;
        if (Value !== -1) return;
        OldPos = ChPos;
        while ((ChPos <= Len) && (Fmt.charAt(ChPos - 1) <= "9") && (Fmt.charAt(ChPos - 1) >= "0")) ChPos += 1;
        if (ChPos > Len) $impl.DoFormatError(1,Fmt);
        if (Fmt.charAt(ChPos - 1) === "*") {
          if (Index === 255) {
            ArgN = ArgPos}
           else {
            ArgN = Index;
            Index += 1;
          };
          if ((ChPos > OldPos) || (ArgN > (rtl.length(Args) - 1))) $impl.DoFormatError(1,Fmt);
          ArgPos = ArgN + 1;
          var $tmp = Args[ArgN].VType;
          if ($tmp === 0) {
            Value = Args[ArgN].VJSValue}
           else if ($tmp === 19) {
            Value = Args[ArgN].VJSValue}
           else {
            $impl.DoFormatError(1,Fmt);
          };
          ChPos += 1;
        } else {
          if (OldPos < ChPos) {
            pas.System.val(pas.System.Copy(Fmt,OldPos,ChPos - OldPos),{get: function () {
                return Value;
              }, set: function (v) {
                Value = v;
              }},{get: function () {
                return Code;
              }, set: function (v) {
                Code = v;
              }});
            if (Code > 0) $impl.DoFormatError(1,Fmt);
          } else Value = -1;
        };
      };
      function ReadIndex() {
        if (Fmt.charAt(ChPos - 1) !== ":") {
          ReadInteger()}
         else Value = 0;
        if (Fmt.charAt(ChPos - 1) === ":") {
          if (Value === -1) $impl.DoFormatError(2,Fmt);
          Index = Value;
          Value = -1;
          ChPos += 1;
        };
      };
      function ReadLeft() {
        if (Fmt.charAt(ChPos - 1) === "-") {
          Left = true;
          ChPos += 1;
        } else Left = false;
      };
      function ReadWidth() {
        ReadInteger();
        if (Value !== -1) {
          Width = Value;
          Value = -1;
        };
      };
      function ReadPrec() {
        if (Fmt.charAt(ChPos - 1) === ".") {
          ChPos += 1;
          ReadInteger();
          if (Value === -1) Value = 0;
          Prec = Value;
        };
      };
      Index = 255;
      Width = -1;
      Prec = -1;
      Value = -1;
      ChPos += 1;
      if (Fmt.charAt(ChPos - 1) === "%") {
        Result = "%";
        return Result;
      };
      ReadIndex();
      ReadLeft();
      ReadWidth();
      ReadPrec();
      Result = pas.System.upcase(Fmt.charAt(ChPos - 1));
      return Result;
    };
    function Checkarg(AT, err) {
      var Result = false;
      Result = false;
      if (Index === 255) {
        DoArg = ArgPos}
       else DoArg = Index;
      ArgPos = DoArg + 1;
      if ((DoArg > (rtl.length(Args) - 1)) || (Args[DoArg].VType !== AT)) {
        if (err) $impl.DoFormatError(3,Fmt);
        ArgPos -= 1;
        return Result;
      };
      Result = true;
      return Result;
    };
    Result = "";
    Len = Fmt.length;
    ChPos = 1;
    OldPos = 1;
    ArgPos = 0;
    while (ChPos <= Len) {
      while ((ChPos <= Len) && (Fmt.charAt(ChPos - 1) !== "%")) ChPos += 1;
      if (ChPos > OldPos) Result = Result + pas.System.Copy(Fmt,OldPos,ChPos - OldPos);
      if (ChPos < Len) {
        Fchar = ReadFormat();
        var $tmp = Fchar;
        if ($tmp === "D") {
          if (Checkarg(0,false)) {
            ToAdd = $mod.IntToStr(Args[DoArg].VJSValue)}
           else if (Checkarg(19,true)) ToAdd = $mod.IntToStr(Args[DoArg].VJSValue);
          Width = Math.abs(Width);
          Index = Prec - ToAdd.length;
          if (ToAdd.charAt(0) !== "-") {
            ToAdd = pas.System.StringOfChar("0",Index) + ToAdd}
           else pas.System.Insert(pas.System.StringOfChar("0",Index + 1),{get: function () {
              return ToAdd;
            }, set: function (v) {
              ToAdd = v;
            }},2);
        } else if ($tmp === "U") {
          if (Checkarg(0,false)) {
            ToAdd = $mod.IntToStr(Args[DoArg].VJSValue >>> 0)}
           else if (Checkarg(19,true)) ToAdd = $mod.IntToStr(Args[DoArg].VJSValue);
          Width = Math.abs(Width);
          Index = Prec - ToAdd.length;
          ToAdd = pas.System.StringOfChar("0",Index) + ToAdd;
        } else if ($tmp === "E") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,$mod.TFloatFormat.ffExponent,3,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,$mod.TFloatFormat.ffExponent,3,Prec,aSettings);
        } else if ($tmp === "F") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,$mod.TFloatFormat.ffFixed,9999,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,$mod.TFloatFormat.ffFixed,9999,Prec,aSettings);
        } else if ($tmp === "G") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,$mod.TFloatFormat.ffGeneral,Prec,3,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,$mod.TFloatFormat.ffGeneral,Prec,3,aSettings);
        } else if ($tmp === "N") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,$mod.TFloatFormat.ffNumber,9999,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,$mod.TFloatFormat.ffNumber,9999,Prec,aSettings);
        } else if ($tmp === "M") {
          if (Checkarg(12,false)) {
            ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue / 10000,$mod.TFloatFormat.ffCurrency,9999,Prec,aSettings)}
           else if (Checkarg(3,true)) ToAdd = $mod.FloatToStrF$1(Args[DoArg].VJSValue,$mod.TFloatFormat.ffCurrency,9999,Prec,aSettings);
        } else if ($tmp === "S") {
          if (Checkarg(18,false)) {
            Hs = Args[DoArg].VJSValue}
           else if (Checkarg(9,true)) Hs = Args[DoArg].VJSValue;
          Index = Hs.length;
          if ((Prec !== -1) && (Index > Prec)) Index = Prec;
          ToAdd = pas.System.Copy(Hs,1,Index);
        } else if ($tmp === "P") {
          if (Checkarg(0,false)) {
            ToAdd = $mod.IntToHex(Args[DoArg].VJSValue,8)}
           else if (Checkarg(0,true)) ToAdd = $mod.IntToHex(Args[DoArg].VJSValue,16);
        } else if ($tmp === "X") {
          if (Checkarg(0,false)) {
            vq = Args[DoArg].VJSValue;
            Index = 16;
          } else if (Checkarg(19,true)) {
            vq = Args[DoArg].VJSValue;
            Index = 31;
          };
          if (Prec > Index) {
            ToAdd = $mod.IntToHex(vq,Index)}
           else {
            Index = 1;
            while ((rtl.shl(1,Index * 4) <= vq) && (Index < 16)) Index += 1;
            if (Index > Prec) Prec = Index;
            ToAdd = $mod.IntToHex(vq,Prec);
          };
        } else if ($tmp === "%") ToAdd = "%";
        if (Width !== -1) if (ToAdd.length < Width) if (!Left) {
          ToAdd = pas.System.StringOfChar(" ",Width - ToAdd.length) + ToAdd}
         else ToAdd = ToAdd + pas.System.StringOfChar(" ",Width - ToAdd.length);
        Result = Result + ToAdd;
      };
      ChPos += 1;
      OldPos = ChPos;
    };
    return Result;
  };
  this.TStringReplaceFlag = {"0": "rfReplaceAll", rfReplaceAll: 0, "1": "rfIgnoreCase", rfIgnoreCase: 1};
  this.StringReplace = function (aOriginal, aSearch, aReplace, Flags) {
    var Result = "";
    var REFlags = "";
    var REString = "";
    REFlags = "";
    if ($mod.TStringReplaceFlag.rfReplaceAll in Flags) REFlags = "g";
    if ($mod.TStringReplaceFlag.rfIgnoreCase in Flags) REFlags = REFlags + "i";
    REString = aSearch.replace(new RegExp($impl.RESpecials,"g"),"\\$1");
    Result = aOriginal.replace(new RegExp(REString,REFlags),aReplace);
    return Result;
  };
  this.IntToStr = function (Value) {
    var Result = "";
    Result = "" + Value;
    return Result;
  };
  this.TryStrToInt$2 = function (S, res) {
    var Result = false;
    Result = $impl.IntTryStrToInt(S,res,$mod.FormatSettings.DecimalSeparator);
    return Result;
  };
  this.StrToIntDef = function (S, aDef) {
    var Result = 0;
    var R = 0;
    if ($mod.TryStrToInt$2(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }})) {
      Result = R}
     else Result = aDef;
    return Result;
  };
  this.StrToInt = function (S) {
    var Result = 0;
    var R = 0;
    if (!$mod.TryStrToInt$2(S,{get: function () {
        return R;
      }, set: function (v) {
        R = v;
      }})) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SErrInvalidInteger"),pas.System.VarRecs(18,S)]);
    Result = R;
    return Result;
  };
  this.IntToHex = function (Value, Digits) {
    var Result = "";
    Result = "";
    if (Value < 0) if (Value<0) Value = 0xFFFFFFFF + Value + 1;
    Result=Value.toString(16);
    Result = $mod.UpperCase(Result);
    while (Result.length < Digits) Result = "0" + Result;
    return Result;
  };
  this.TFloatFormat = {"0": "ffFixed", ffFixed: 0, "1": "ffGeneral", ffGeneral: 1, "2": "ffExponent", ffExponent: 2, "3": "ffNumber", ffNumber: 3, "4": "ffCurrency", ffCurrency: 4};
  this.FloatToStr = function (Value) {
    var Result = "";
    Result = $mod.FloatToStr$1(Value,$mod.FormatSettings);
    return Result;
  };
  this.FloatToStr$1 = function (Value, aSettings) {
    var Result = "";
    Result = $mod.FloatToStrF$1(Value,$mod.TFloatFormat.ffGeneral,15,0,aSettings);
    return Result;
  };
  this.FloatToStrF$1 = function (Value, format, Precision, Digits, aSettings) {
    var Result = "";
    var TS = "";
    var DS = "";
    DS = aSettings.DecimalSeparator;
    TS = aSettings.ThousandSeparator;
    var $tmp = format;
    if ($tmp === $mod.TFloatFormat.ffGeneral) {
      Result = $impl.FormatGeneralFloat(Value,Precision,DS)}
     else if ($tmp === $mod.TFloatFormat.ffExponent) {
      Result = $impl.FormatExponentFloat(Value,Precision,Digits,DS)}
     else if ($tmp === $mod.TFloatFormat.ffFixed) {
      Result = $impl.FormatFixedFloat(Value,Digits,DS)}
     else if ($tmp === $mod.TFloatFormat.ffNumber) {
      Result = $impl.FormatNumberFloat(Value,Digits,DS,TS)}
     else if ($tmp === $mod.TFloatFormat.ffCurrency) Result = $impl.FormatNumberCurrency(Value * 10000,Digits,aSettings);
    if ((format !== $mod.TFloatFormat.ffCurrency) && (Result.length > 1) && (Result.charAt(0) === "-")) $impl.RemoveLeadingNegativeSign({get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }},DS,TS);
    return Result;
  };
  this.TryStrToFloat = function (S, res) {
    var Result = false;
    Result = $mod.TryStrToFloat$2(S,res);
    return Result;
  };
  this.TryStrToFloat$2 = function (S, res) {
    var Result = false;
    Result = $mod.TryStrToFloat$3(S,res,$mod.FormatSettings);
    return Result;
  };
  var TDecimalPart = {"0": "dpDigit", dpDigit: 0, "1": "dpSignificand", dpSignificand: 1, "2": "dpExp", dpExp: 2};
  this.TryStrToFloat$3 = function (S, res, aSettings) {
    var Result = false;
    var J = undefined;
    var I = 0;
    var aStart = 0;
    var Len = 0;
    var N = "";
    var p = 0;
    Result = false;
    N = S;
    if (aSettings.ThousandSeparator !== "") N = $mod.StringReplace(N,aSettings.ThousandSeparator,"",rtl.createSet($mod.TStringReplaceFlag.rfReplaceAll));
    if (aSettings.DecimalSeparator !== ".") N = $mod.StringReplace(N,aSettings.DecimalSeparator,".",{});
    p = TDecimalPart.dpDigit;
    I = 1;
    aStart = 1;
    Len = N.length;
    while (I <= Len) {
      var $tmp = N.charAt(I - 1);
      if (($tmp === "+") || ($tmp === "-")) {
        var $tmp1 = p;
        if ($tmp1 === TDecimalPart.dpSignificand) {
          return Result}
         else if ($tmp1 === TDecimalPart.dpDigit) {
          if (I > aStart) return Result}
         else if ($tmp1 === TDecimalPart.dpExp) if (I > (aStart + 1)) return Result;
      } else if (($tmp >= "0") && ($tmp <= "9")) {}
      else if ($tmp === ".") {
        if (p !== TDecimalPart.dpDigit) return Result;
        p = TDecimalPart.dpSignificand;
        aStart = I;
      } else if (($tmp === "E") || ($tmp === "e")) {
        if (p === TDecimalPart.dpExp) {
          return Result}
         else {
          p = TDecimalPart.dpExp;
          aStart = I;
        };
      } else {
        return Result;
      };
      I += 1;
    };
    J = parseFloat(N);
    Result = !isNaN(J);
    if (Result) res.set(rtl.getNumber(J));
    return Result;
  };
  this.TimeSeparator = "";
  this.DateSeparator = "";
  this.ShortDateFormat = "";
  this.LongDateFormat = "";
  this.ShortTimeFormat = "";
  this.LongTimeFormat = "";
  this.DecimalSeparator = "";
  this.ThousandSeparator = "";
  this.TimeAMString = "";
  this.TimePMString = "";
  this.ShortMonthNames = rtl.arraySetLength(null,"",12);
  this.LongMonthNames = rtl.arraySetLength(null,"",12);
  this.ShortDayNames = rtl.arraySetLength(null,"",7);
  this.LongDayNames = rtl.arraySetLength(null,"",7);
  this.FormatSettings = this.TFormatSettings.$new();
  this.CurrencyFormat = 0;
  this.NegCurrFormat = 0;
  this.CurrencyDecimals = 0;
  this.CurrencyString = "";
  this.TStringSplitOptions = {"0": "None", None: 0, "1": "ExcludeEmpty", ExcludeEmpty: 1};
  rtl.createHelper(this,"TStringHelper",null,function () {
    this.GetLength = function () {
      var Result = 0;
      Result = this.get().length;
      return Result;
    };
    this.IndexOfAny$3 = function (AnyOf, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAny$5.call(this,AnyOf,StartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOfAny$5 = function (AnyOf, StartIndex, ACount) {
      var Result = 0;
      var i = 0;
      var L = 0;
      i = StartIndex + 1;
      L = (i + ACount) - 1;
      if (L > $mod.TStringHelper.GetLength.call(this)) L = $mod.TStringHelper.GetLength.call(this);
      Result = -1;
      while ((Result === -1) && (i <= L)) {
        if ($impl.HaveChar(this.get().charAt(i - 1),AnyOf)) Result = i - 1;
        i += 1;
      };
      return Result;
    };
    this.IndexOfAnyUnquoted$1 = function (AnyOf, StartQuote, EndQuote, StartIndex) {
      var Result = 0;
      Result = $mod.TStringHelper.IndexOfAnyUnquoted$2.call(this,AnyOf,StartQuote,EndQuote,StartIndex,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.IndexOfAnyUnquoted$2 = function (AnyOf, StartQuote, EndQuote, StartIndex, ACount) {
      var Result = 0;
      var I = 0;
      var L = 0;
      var Q = 0;
      Result = -1;
      L = (StartIndex + ACount) - 1;
      if (L > $mod.TStringHelper.GetLength.call(this)) L = $mod.TStringHelper.GetLength.call(this);
      I = StartIndex + 1;
      Q = 0;
      if (StartQuote === EndQuote) {
        while ((Result === -1) && (I <= L)) {
          if (this.get().charAt(I - 1) === StartQuote) Q = 1 - Q;
          if ((Q === 0) && $impl.HaveChar(this.get().charAt(I - 1),AnyOf)) Result = I - 1;
          I += 1;
        };
      } else {
        while ((Result === -1) && (I <= L)) {
          if (this.get().charAt(I - 1) === StartQuote) {
            Q += 1}
           else if ((this.get().charAt(I - 1) === EndQuote) && (Q > 0)) Q -= 1;
          if ((Q === 0) && $impl.HaveChar(this.get().charAt(I - 1),AnyOf)) Result = I - 1;
          I += 1;
        };
      };
      return Result;
    };
    this.Split = function (Separators) {
      var Result = [];
      Result = $mod.TStringHelper.Split$1.call(this,$mod.TStringHelper.ToCharArray$1.call({get: function () {
          return Separators;
        }, set: function (v) {
          rtl.raiseE("EPropReadOnly");
        }}));
      return Result;
    };
    this.Split$1 = function (Separators) {
      var Result = [];
      Result = $mod.TStringHelper.Split$21.call(this,Separators,"\x00","\x00",$mod.TStringHelper.GetLength.call(this) + 1,$mod.TStringSplitOptions.None);
      return Result;
    };
    var BlockSize = 10;
    this.Split$21 = function (Separators, AQuoteStart, AQuoteEnd, ACount, Options) {
      var $Self = this;
      var Result = [];
      var S = "";
      function NextSep(StartIndex) {
        var Result = 0;
        if (AQuoteStart !== "\x00") {
          Result = $mod.TStringHelper.IndexOfAnyUnquoted$1.call({get: function () {
              return S;
            }, set: function (v) {
              S = v;
            }},Separators,AQuoteStart,AQuoteEnd,StartIndex)}
         else Result = $mod.TStringHelper.IndexOfAny$3.call({get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},Separators,StartIndex);
        return Result;
      };
      function MaybeGrow(Curlen) {
        if (rtl.length(Result) <= Curlen) Result = rtl.arraySetLength(Result,"",rtl.length(Result) + 10);
      };
      var Sep = 0;
      var LastSep = 0;
      var Len = 0;
      var T = "";
      S = $Self.get();
      Result = rtl.arraySetLength(Result,"",10);
      Len = 0;
      LastSep = 0;
      Sep = NextSep(0);
      while ((Sep !== -1) && ((ACount === 0) || (Len < ACount))) {
        T = $mod.TStringHelper.Substring$1.call($Self,LastSep,Sep - LastSep);
        if ((T !== "") || !($mod.TStringSplitOptions.ExcludeEmpty === Options)) {
          MaybeGrow(Len);
          Result[Len] = T;
          Len += 1;
        };
        LastSep = Sep + 1;
        Sep = NextSep(LastSep);
      };
      if ((LastSep <= $mod.TStringHelper.GetLength.call($Self)) && ((ACount === 0) || (Len < ACount))) {
        T = $mod.TStringHelper.Substring.call($Self,LastSep);
        if ((T !== "") || !($mod.TStringSplitOptions.ExcludeEmpty === Options)) {
          MaybeGrow(Len);
          Result[Len] = T;
          Len += 1;
        };
      };
      Result = rtl.arraySetLength(Result,"",Len);
      return Result;
    };
    this.Substring = function (AStartIndex) {
      var Result = "";
      Result = $mod.TStringHelper.Substring$1.call(this,AStartIndex,$mod.TStringHelper.GetLength.call(this) - AStartIndex);
      return Result;
    };
    this.Substring$1 = function (AStartIndex, ALen) {
      var Result = "";
      Result = pas.System.Copy(this.get(),AStartIndex + 1,ALen);
      return Result;
    };
    this.ToCharArray$1 = function () {
      var Result = [];
      Result = $mod.TStringHelper.ToCharArray$2.call(this,0,$mod.TStringHelper.GetLength.call(this));
      return Result;
    };
    this.ToCharArray$2 = function (AStartIndex, ALen) {
      var Result = [];
      var I = 0;
      Result = rtl.arraySetLength(Result,"",ALen);
      for (var $l = 0, $end = ALen - 1; $l <= $end; $l++) {
        I = $l;
        Result[I] = this.get().charAt((AStartIndex + I + 1) - 1);
      };
      return Result;
    };
  });
  $mod.$implcode = function () {
    $impl.DefaultShortMonthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    $impl.DefaultLongMonthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    $impl.DefaultShortDayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    $impl.DefaultLongDayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    $impl.feInvalidFormat = 1;
    $impl.feMissingArgument = 2;
    $impl.feInvalidArgIndex = 3;
    $impl.DoFormatError = function (ErrCode, fmt) {
      var $tmp = ErrCode;
      if ($tmp === 1) {
        throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidFormat"),pas.System.VarRecs(18,fmt)])}
       else if ($tmp === 2) {
        throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SArgumentMissing"),pas.System.VarRecs(18,fmt)])}
       else if ($tmp === 3) throw $mod.EConvertError.$create("CreateFmt",[rtl.getResStr(pas.RTLConsts,"SInvalidArgIndex"),pas.System.VarRecs(18,fmt)]);
    };
    $impl.maxdigits = 15;
    $impl.ReplaceDecimalSep = function (S, DS) {
      var Result = "";
      var P = 0;
      P = pas.System.Pos(".",S);
      if (P > 0) {
        Result = pas.System.Copy(S,1,P - 1) + DS + pas.System.Copy(S,P + 1,S.length - P)}
       else Result = S;
      return Result;
    };
    $impl.FormatGeneralFloat = function (Value, Precision, DS) {
      var Result = "";
      var P = 0;
      var PE = 0;
      var Q = 0;
      var Exponent = 0;
      if ((Precision === -1) || (Precision > 15)) Precision = 15;
      Result = rtl.floatToStr(Value,Precision + 7);
      Result = $mod.TrimLeft(Result);
      P = pas.System.Pos(".",Result);
      if (P === 0) return Result;
      PE = pas.System.Pos("E",Result);
      if (PE === 0) {
        Result = $impl.ReplaceDecimalSep(Result,DS);
        return Result;
      };
      Q = PE + 2;
      Exponent = 0;
      while (Q <= Result.length) {
        Exponent = ((Exponent * 10) + Result.charCodeAt(Q - 1)) - 48;
        Q += 1;
      };
      if (Result.charAt((PE + 1) - 1) === "-") Exponent = -Exponent;
      if (((P + Exponent) < PE) && (Exponent > -6)) {
        Result = rtl.strSetLength(Result,PE - 1);
        if (Exponent >= 0) {
          for (var $l = 0, $end = Exponent - 1; $l <= $end; $l++) {
            Q = $l;
            Result = rtl.setCharAt(Result,P - 1,Result.charAt((P + 1) - 1));
            P += 1;
          };
          Result = rtl.setCharAt(Result,P - 1,".");
          P = 1;
          if (Result.charAt(P - 1) === "-") P += 1;
          while ((Result.charAt(P - 1) === "0") && (P < Result.length) && (pas.System.Copy(Result,P + 1,DS.length) !== DS)) pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P,1);
        } else {
          pas.System.Insert(pas.System.Copy("00000",1,-Exponent),{get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P - 1);
          Result = rtl.setCharAt(Result,P - Exponent - 1,Result.charAt(P - Exponent - 1 - 1));
          Result = rtl.setCharAt(Result,P - 1,".");
          if (Exponent !== -1) Result = rtl.setCharAt(Result,P - Exponent - 1 - 1,"0");
        };
        Q = Result.length;
        while ((Q > 0) && (Result.charAt(Q - 1) === "0")) Q -= 1;
        if (Result.charAt(Q - 1) === ".") Q -= 1;
        if ((Q === 0) || ((Q === 1) && (Result.charAt(0) === "-"))) {
          Result = "0"}
         else Result = rtl.strSetLength(Result,Q);
      } else {
        while (Result.charAt(PE - 1 - 1) === "0") {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},PE - 1,1);
          PE -= 1;
        };
        if (Result.charAt(PE - 1 - 1) === DS) {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},PE - 1,1);
          PE -= 1;
        };
        if (Result.charAt((PE + 1) - 1) === "+") {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},PE + 1,1)}
         else PE += 1;
        while (Result.charAt((PE + 1) - 1) === "0") pas.System.Delete({get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},PE + 1,1);
      };
      Result = $impl.ReplaceDecimalSep(Result,DS);
      return Result;
    };
    $impl.FormatExponentFloat = function (Value, Precision, Digits, DS) {
      var Result = "";
      var P = 0;
      DS = $mod.FormatSettings.DecimalSeparator;
      if ((Precision === -1) || (Precision > 15)) Precision = 15;
      Result = rtl.floatToStr(Value,Precision + 7);
      while (Result.charAt(0) === " ") pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      P = pas.System.Pos("E",Result);
      if (P === 0) {
        Result = $impl.ReplaceDecimalSep(Result,DS);
        return Result;
      };
      P += 2;
      if (Digits > 4) Digits = 4;
      Digits = (Result.length - P - Digits) + 1;
      if (Digits < 0) {
        pas.System.Insert(pas.System.Copy("0000",1,-Digits),{get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},P)}
       else while ((Digits > 0) && (Result.charAt(P - 1) === "0")) {
        pas.System.Delete({get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},P,1);
        if (P > Result.length) {
          pas.System.Delete({get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P - 2,2);
          break;
        };
        Digits -= 1;
      };
      Result = $impl.ReplaceDecimalSep(Result,DS);
      return Result;
    };
    $impl.FormatFixedFloat = function (Value, Digits, DS) {
      var Result = "";
      if (Digits === -1) {
        Digits = 2}
       else if (Digits > 18) Digits = 18;
      Result = rtl.floatToStr(Value,0,Digits);
      if ((Result !== "") && (Result.charAt(0) === " ")) pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      Result = $impl.ReplaceDecimalSep(Result,DS);
      return Result;
    };
    $impl.FormatNumberFloat = function (Value, Digits, DS, TS) {
      var Result = "";
      var P = 0;
      if (Digits === -1) {
        Digits = 2}
       else if (Digits > 15) Digits = 15;
      Result = rtl.floatToStr(Value,0,Digits);
      if ((Result !== "") && (Result.charAt(0) === " ")) pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      P = pas.System.Pos(".",Result);
      if (P <= 0) P = Result.length + 1;
      Result = $impl.ReplaceDecimalSep(Result,DS);
      P -= 3;
      if ((TS !== "") && (TS !== "\x00")) while (P > 1) {
        if (Result.charAt(P - 1 - 1) !== "-") pas.System.Insert(TS,{get: function () {
            return Result;
          }, set: function (v) {
            Result = v;
          }},P);
        P -= 3;
      };
      return Result;
    };
    $impl.RemoveLeadingNegativeSign = function (AValue, DS, aThousandSeparator) {
      var Result = false;
      var i = 0;
      var TS = "";
      var StartPos = 0;
      Result = false;
      StartPos = 2;
      TS = aThousandSeparator;
      for (var $l = StartPos, $end = AValue.get().length; $l <= $end; $l++) {
        i = $l;
        Result = (AValue.get().charCodeAt(i - 1) in rtl.createSet(48,DS.charCodeAt(),69,43)) || (AValue.get().charAt(i - 1) === TS);
        if (!Result) break;
      };
      if (Result && (AValue.get().charAt(0) === "-")) pas.System.Delete(AValue,1,1);
      return Result;
    };
    $impl.FormatNumberCurrency = function (Value, Digits, aSettings) {
      var Result = "";
      var Negative = false;
      var P = 0;
      var CS = "";
      var DS = "";
      var TS = "";
      DS = aSettings.DecimalSeparator;
      TS = aSettings.ThousandSeparator;
      CS = aSettings.CurrencyString;
      if (Digits === -1) {
        Digits = aSettings.CurrencyDecimals}
       else if (Digits > 18) Digits = 18;
      Result = rtl.floatToStr(Value / 10000,0,Digits);
      Negative = Result.charAt(0) === "-";
      if (Negative) pas.System.Delete({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},1,1);
      P = pas.System.Pos(".",Result);
      if (TS !== "") {
        if (P !== 0) {
          Result = $impl.ReplaceDecimalSep(Result,DS)}
         else P = Result.length + 1;
        P -= 3;
        while (P > 1) {
          pas.System.Insert(TS,{get: function () {
              return Result;
            }, set: function (v) {
              Result = v;
            }},P);
          P -= 3;
        };
      };
      if (Negative) $impl.RemoveLeadingNegativeSign({get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }},DS,TS);
      if (!Negative) {
        var $tmp = aSettings.CurrencyFormat;
        if ($tmp === 0) {
          Result = CS + Result}
         else if ($tmp === 1) {
          Result = Result + CS}
         else if ($tmp === 2) {
          Result = CS + " " + Result}
         else if ($tmp === 3) Result = Result + " " + CS;
      } else {
        var $tmp1 = aSettings.NegCurrFormat;
        if ($tmp1 === 0) {
          Result = "(" + CS + Result + ")"}
         else if ($tmp1 === 1) {
          Result = "-" + CS + Result}
         else if ($tmp1 === 2) {
          Result = CS + "-" + Result}
         else if ($tmp1 === 3) {
          Result = CS + Result + "-"}
         else if ($tmp1 === 4) {
          Result = "(" + Result + CS + ")"}
         else if ($tmp1 === 5) {
          Result = "-" + Result + CS}
         else if ($tmp1 === 6) {
          Result = Result + "-" + CS}
         else if ($tmp1 === 7) {
          Result = Result + CS + "-"}
         else if ($tmp1 === 8) {
          Result = "-" + Result + " " + CS}
         else if ($tmp1 === 9) {
          Result = "-" + CS + " " + Result}
         else if ($tmp1 === 10) {
          Result = Result + " " + CS + "-"}
         else if ($tmp1 === 11) {
          Result = CS + " " + Result + "-"}
         else if ($tmp1 === 12) {
          Result = CS + " " + "-" + Result}
         else if ($tmp1 === 13) {
          Result = Result + "-" + " " + CS}
         else if ($tmp1 === 14) {
          Result = "(" + CS + " " + Result + ")"}
         else if ($tmp1 === 15) Result = "(" + Result + " " + CS + ")";
      };
      return Result;
    };
    $impl.RESpecials = "([\\$\\+\\[\\]\\(\\)\\\\\\.\\*\\^\\?\\|])";
    $impl.IntTryStrToInt = function (S, res, aSep) {
      var Result = false;
      var Radix = 10;
      var N = "";
      var J = undefined;
      N = S;
      if ((pas.System.Pos(aSep,N) !== 0) || (pas.System.Pos(".",N) !== 0)) return false;
      var $tmp = pas.System.Copy(N,1,1);
      if ($tmp === "$") {
        Radix = 16}
       else if ($tmp === "&") {
        Radix = 8}
       else if ($tmp === "%") Radix = 2;
      if ((Radix !== 16) && (pas.System.Pos("e",$mod.LowerCase(N)) !== 0)) return false;
      if (Radix !== 10) pas.System.Delete({get: function () {
          return N;
        }, set: function (v) {
          N = v;
        }},1,1);
      J = parseInt(N,Radix);
      Result = !isNaN(J);
      if (Result) res.set(rtl.trunc(J));
      return Result;
    };
    $impl.InitGlobalFormatSettings = function () {
      $mod.FormatSettings.$assign($mod.TFormatSettings.Create());
      $mod.TimeSeparator = $mod.FormatSettings.TimeSeparator;
      $mod.DateSeparator = $mod.FormatSettings.DateSeparator;
      $mod.ShortDateFormat = $mod.FormatSettings.ShortDateFormat;
      $mod.LongDateFormat = $mod.FormatSettings.LongDateFormat;
      $mod.ShortTimeFormat = $mod.FormatSettings.ShortTimeFormat;
      $mod.LongTimeFormat = $mod.FormatSettings.LongTimeFormat;
      $mod.DecimalSeparator = $mod.FormatSettings.DecimalSeparator;
      $mod.ThousandSeparator = $mod.FormatSettings.ThousandSeparator;
      $mod.TimeAMString = $mod.FormatSettings.TimeAMString;
      $mod.TimePMString = $mod.FormatSettings.TimePMString;
      $mod.CurrencyFormat = $mod.FormatSettings.CurrencyFormat;
      $mod.NegCurrFormat = $mod.FormatSettings.NegCurrFormat;
      $mod.CurrencyDecimals = $mod.FormatSettings.CurrencyDecimals;
      $mod.CurrencyString = $mod.FormatSettings.CurrencyString;
    };
    $impl.HaveChar = function (AChar, AList) {
      var Result = false;
      var I = 0;
      I = 0;
      Result = false;
      while (!Result && (I < rtl.length(AList))) {
        Result = AList[I] === AChar;
        I += 1;
      };
      return Result;
    };
  };
  $mod.$init = function () {
    (function () {
      $impl.InitGlobalFormatSettings();
    })();
    $mod.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
    $mod.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
    $mod.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
    $mod.LongDayNames = $impl.DefaultLongDayNames.slice(0);
  };
},[]);
rtl.module("Math",["System"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.IsZero = function (d, Epsilon) {
    var Result = false;
    if (Epsilon === 0) Epsilon = 1E-12;
    Result = Math.abs(d) <= Epsilon;
    return Result;
  };
  $mod.$implcode = function () {
    $impl.DZeroResolution = 1E-12;
  };
},[]);
rtl.module("DOM",["System","JS","Web","SysUtils"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TDomNodeList",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FItems = [];
    };
    this.$final = function () {
      this.FItems = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.GetItem = function (Index) {
      var Result = null;
      if ((Index < 0) || (Index >= rtl.length(this.FItems))) return null;
      Result = this.FItems[Index];
      return Result;
    };
    this.Create$1 = function (ANodes) {
      var I = 0;
      pas.System.TObject.Create.call(this);
      this.FItems = rtl.arraySetLength(this.FItems,null,ANodes.length);
      for (var $l = 0, $end = ANodes.length - 1; $l <= $end; $l++) {
        I = $l;
        this.FItems[I] = $mod.WrapDomNode(ANodes.item(I));
      };
      return this;
    };
    this.Count = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
  });
  rtl.createClass(this,"TDomNamedNodeMap",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FItems = [];
    };
    this.$final = function () {
      this.FItems = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.GetItem = function (Index) {
      var Result = null;
      if ((Index < 0) || (Index >= rtl.length(this.FItems))) return null;
      Result = this.FItems[Index];
      return Result;
    };
    this.Create$1 = function (AAttributes) {
      var I = 0;
      var N = 0;
      pas.System.TObject.Create.call(this);
      if (AAttributes === null) {
        N = 0}
       else N = rtl.trunc(AAttributes["length"]);
      this.FItems = rtl.arraySetLength(this.FItems,null,N);
      for (var $l = 0, $end = N - 1; $l <= $end; $l++) {
        I = $l;
        this.FItems[I] = $mod.TDomNode.$create("Create$1",[AAttributes.item(I)]);
      };
      return this;
    };
    this.Length = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
  });
  rtl.createClass(this,"TDomNode",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FNode = null;
    };
    this.$final = function () {
      this.FNode = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function (ANode) {
      pas.System.TObject.Create.call(this);
      this.FNode = ANode;
      return this;
    };
    this.FindNode = function (AName) {
      var Result = null;
      var I = 0;
      var Nodes = null;
      var Child = null;
      Result = null;
      Nodes = this.GetChildNodes();
      for (var $l = 0, $end = Nodes.Count() - 1; $l <= $end; $l++) {
        I = $l;
        Child = Nodes.GetItem(I);
        if (pas.SysUtils.SameText(Child.GetNodeName(),AName)) return Child;
      };
      return Result;
    };
    this.CompareName = function (AName) {
      var Result = 0;
      if (pas.SysUtils.SameText(this.GetNodeName(),AName)) {
        Result = 0}
       else Result = 1;
      return Result;
    };
    this.GetAttributes = function () {
      var Result = null;
      if (this.FNode.nodeType === 1) {
        Result = $mod.TDomNamedNodeMap.$create("Create$1",[this.FNode.attributes])}
       else Result = $mod.TDomNamedNodeMap.$create("Create$1",[null]);
      return Result;
    };
    this.GetChildNodes = function () {
      var Result = null;
      Result = $mod.TDomNodeList.$create("Create$1",[this.FNode.childNodes]);
      return Result;
    };
    this.GetParentNode = function () {
      var Result = null;
      Result = $mod.WrapDomNode(this.FNode.parentNode);
      return Result;
    };
    this.GetNodeName = function () {
      var Result = "";
      Result = this.FNode.nodeName;
      return Result;
    };
    this.GetNodeValue = function () {
      var Result = "";
      Result = this.FNode.nodeValue;
      return Result;
    };
    this.GetTextContent = function () {
      var Result = "";
      Result = this.FNode.textContent;
      return Result;
    };
  });
  rtl.createClass(this,"TDomElement",this.TDomNode,function () {
    this.GetAttribute = function (AName) {
      var Result = "";
      if (!this.FNode.hasAttribute(AName)) {
        Result = ""}
       else Result = this.FNode.getAttribute(AName);
      return Result;
    };
    this.Create$2 = function (ANode) {
      $mod.TDomNode.Create$1.call(this,ANode);
      return this;
    };
  });
  rtl.createClass(this,"TXmlDocument",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FDocument = null;
    };
    this.$final = function () {
      this.FDocument = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.GetDocumentElement = function () {
      var Result = null;
      Result = $mod.WrapDomNode(this.FDocument.documentElement);
      return Result;
    };
  });
  this.WrapDomNode = function (ANode) {
    var Result = null;
    if (ANode === null) return null;
    if (ANode.nodeType === 1) {
      Result = $mod.TDomElement.$create("Create$2",[ANode])}
     else Result = $mod.TDomNode.$create("Create$1",[ANode]);
    return Result;
  };
});
rtl.module("Classes",["System","RTLConsts","Types","SysUtils","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"EListError",pas.SysUtils.Exception,function () {
  });
  rtl.createClass(this,"EStringListError",this.EListError,function () {
  });
  rtl.createClass(this,"TPersistent",pas.System.TObject,function () {
  });
  rtl.createClass(this,"TStrings",this.TPersistent,function () {
    this.$init = function () {
      $mod.TPersistent.$init.call(this);
      this.FSpecialCharsInited = false;
      this.FAlwaysQuote = false;
      this.FQuoteChar = "";
      this.FDelimiter = "";
      this.FNameValueSeparator = "";
      this.FUpdateCount = 0;
      this.FLBS = 0;
      this.FLineBreak = "";
    };
    this.DoSetTextStr = function (Value, DoClear) {
      var S = "";
      var P = 0;
      try {
        this.BeginUpdate();
        if (DoClear) this.Clear();
        P = 1;
        while (this.GetNextLinebreak(Value,{get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},{get: function () {
            return P;
          }, set: function (v) {
            P = v;
          }})) this.Add(S);
      } finally {
        this.EndUpdate();
      };
    };
    this.Error = function (Msg, Data) {
      throw $mod.EStringListError.$create("CreateFmt",[Msg,pas.System.VarRecs(18,pas.SysUtils.IntToStr(Data))]);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = this.GetCount();
      return Result;
    };
    this.SetTextStr = function (Value) {
      this.CheckSpecialChars();
      this.DoSetTextStr(Value,true);
    };
    this.SetUpdateState = function (Updating) {
      if (Updating) ;
    };
    this.CheckSpecialChars = function () {
      if (!this.FSpecialCharsInited) {
        this.FQuoteChar = '"';
        this.FDelimiter = ",";
        this.FNameValueSeparator = "=";
        this.FLBS = pas.System.DefaultTextLineBreakStyle;
        this.FSpecialCharsInited = true;
        this.FLineBreak = pas.System.sLineBreak;
      };
    };
    this.GetNextLinebreak = function (Value, S, P) {
      var Result = false;
      var PPLF = 0;
      var PPCR = 0;
      var PP = 0;
      var PL = 0;
      S.set("");
      Result = false;
      if ((Value.length - P.get()) < 0) return Result;
      PPLF = Value.indexOf("\n",P.get() - 1) + 1;
      PPCR = Value.indexOf("\r",P.get() - 1) + 1;
      PL = 1;
      if ((PPLF > 0) && (PPCR > 0)) {
        if ((PPLF - PPCR) === 1) PL = 2;
        if (PPLF < PPCR) {
          PP = PPLF}
         else PP = PPCR;
      } else if ((PPLF > 0) && (PPCR < 1)) {
        PP = PPLF}
       else if ((PPCR > 0) && (PPLF < 1)) {
        PP = PPCR}
       else PP = Value.length + 1;
      S.set(pas.System.Copy(Value,P.get(),PP - P.get()));
      P.set(PP + PL);
      Result = true;
      return Result;
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.FAlwaysQuote = false;
      return this;
    };
    this.Destroy = function () {
      pas.System.TObject.Destroy.call(this);
    };
    this.Add = function (S) {
      var Result = 0;
      Result = this.GetCount();
      this.Insert(this.GetCount(),S);
      return Result;
    };
    this.BeginUpdate = function () {
      if (this.FUpdateCount === 0) this.SetUpdateState(true);
      this.FUpdateCount += 1;
    };
    this.EndUpdate = function () {
      if (this.FUpdateCount > 0) this.FUpdateCount -= 1;
      if (this.FUpdateCount === 0) this.SetUpdateState(false);
    };
  });
  rtl.recNewT(this,"TStringItem",function () {
    this.FString = "";
    this.FObject = null;
    this.$eq = function (b) {
      return (this.FString === b.FString) && (this.FObject === b.FObject);
    };
    this.$assign = function (s) {
      this.FString = s.FString;
      this.FObject = s.FObject;
      return this;
    };
  });
  this.TStringsSortStyle = {"0": "sslNone", sslNone: 0, "1": "sslUser", sslUser: 1, "2": "sslAuto", sslAuto: 2};
  rtl.createClass(this,"TStringList",this.TStrings,function () {
    this.$init = function () {
      $mod.TStrings.$init.call(this);
      this.FList = [];
      this.FCount = 0;
      this.FOnChange = null;
      this.FOnChanging = null;
      this.FDuplicates = 0;
      this.FCaseSensitive = false;
      this.FOwnsObjects = false;
      this.FSortStyle = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      this.FOnChange = undefined;
      this.FOnChanging = undefined;
      $mod.TStrings.$final.call(this);
    };
    this.GetSorted = function () {
      var Result = false;
      Result = this.FSortStyle in rtl.createSet($mod.TStringsSortStyle.sslUser,$mod.TStringsSortStyle.sslAuto);
      return Result;
    };
    this.Grow = function () {
      var NC = 0;
      NC = this.GetCapacity();
      if (NC >= 256) {
        NC = NC + rtl.trunc(NC / 4)}
       else if (NC === 0) {
        NC = 4}
       else NC = NC * 4;
      this.SetCapacity(NC);
    };
    this.InternalClear = function (FromIndex, ClearOnly) {
      var I = 0;
      if (FromIndex < this.FCount) {
        if (this.FOwnsObjects) {
          for (var $l = FromIndex, $end = this.FCount - 1; $l <= $end; $l++) {
            I = $l;
            this.FList[I].FString = "";
            pas.SysUtils.FreeAndNil({p: this.FList[I], get: function () {
                return this.p.FObject;
              }, set: function (v) {
                this.p.FObject = v;
              }});
          };
        } else {
          for (var $l1 = FromIndex, $end1 = this.FCount - 1; $l1 <= $end1; $l1++) {
            I = $l1;
            this.FList[I].FString = "";
          };
        };
        this.FCount = FromIndex;
      };
      if (!ClearOnly) this.SetCapacity(0);
    };
    this.CheckIndex = function (AIndex) {
      if ((AIndex < 0) || (AIndex >= this.FCount)) this.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),AIndex);
    };
    this.Changed = function () {
      if (this.FUpdateCount === 0) {
        if (this.FOnChange != null) this.FOnChange(this);
      };
    };
    this.Changing = function () {
      if (this.FUpdateCount === 0) if (this.FOnChanging != null) this.FOnChanging(this);
    };
    this.Get = function (Index) {
      var Result = "";
      this.CheckIndex(Index);
      Result = this.FList[Index].FString;
      return Result;
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FList);
      return Result;
    };
    this.GetCount = function () {
      var Result = 0;
      Result = this.FCount;
      return Result;
    };
    this.SetCapacity = function (NewCapacity) {
      if (NewCapacity < 0) this.Error(rtl.getResStr(pas.RTLConsts,"SListCapacityError"),NewCapacity);
      if (NewCapacity !== this.GetCapacity()) this.FList = rtl.arraySetLength(this.FList,$mod.TStringItem,NewCapacity);
    };
    this.SetUpdateState = function (Updating) {
      if (Updating) {
        this.Changing()}
       else this.Changed();
    };
    this.InsertItem = function (Index, S) {
      this.InsertItem$1(Index,S,null);
    };
    this.InsertItem$1 = function (Index, S, O) {
      var It = $mod.TStringItem.$new();
      this.Changing();
      if (this.FCount === this.GetCapacity()) this.Grow();
      It.FString = S;
      It.FObject = O;
      this.FList.splice(Index,0,It);
      this.FCount += 1;
      this.Changed();
    };
    this.DoCompareText = function (s1, s2) {
      var Result = 0;
      if (this.FCaseSensitive) {
        Result = pas.SysUtils.CompareStr(s1,s2)}
       else Result = pas.SysUtils.CompareText(s1,s2);
      return Result;
    };
    this.Destroy = function () {
      this.InternalClear(0,false);
      $mod.TStrings.Destroy.call(this);
    };
    this.Add = function (S) {
      var Result = 0;
      if (!(this.FSortStyle === $mod.TStringsSortStyle.sslAuto)) {
        Result = this.FCount}
       else if (this.Find(S,{get: function () {
          return Result;
        }, set: function (v) {
          Result = v;
        }})) {
        var $tmp = this.FDuplicates;
        if ($tmp === pas.Types.TDuplicates.dupIgnore) {
          return Result}
         else if ($tmp === pas.Types.TDuplicates.dupError) this.Error(rtl.getResStr(pas.RTLConsts,"SDuplicateString"),0);
      };
      this.InsertItem(Result,S);
      return Result;
    };
    this.Clear = function () {
      if (this.FCount === 0) return;
      this.Changing();
      this.InternalClear(0,false);
      this.Changed();
    };
    this.Delete = function (Index) {
      this.CheckIndex(Index);
      this.Changing();
      if (this.FOwnsObjects) pas.SysUtils.FreeAndNil({p: this.FList[Index], get: function () {
          return this.p.FObject;
        }, set: function (v) {
          this.p.FObject = v;
        }});
      this.FList.splice(Index,1);
      this.FList[this.GetCount() - 1].FString = "";
      this.FList[this.GetCount() - 1].FObject = null;
      this.FCount -= 1;
      this.Changed();
    };
    this.Find = function (S, Index) {
      var Result = false;
      var L = 0;
      var R = 0;
      var I = 0;
      var CompareRes = 0;
      Result = false;
      Index.set(-1);
      if (!this.GetSorted()) throw $mod.EListError.$create("Create$1",[rtl.getResStr(pas.RTLConsts,"SErrFindNeedsSortedList")]);
      L = 0;
      R = this.GetCount() - 1;
      while (L <= R) {
        I = L + rtl.trunc((R - L) / 2);
        CompareRes = this.DoCompareText(S,this.FList[I].FString);
        if (CompareRes > 0) {
          L = I + 1}
         else {
          R = I - 1;
          if (CompareRes === 0) {
            Result = true;
            if (this.FDuplicates !== pas.Types.TDuplicates.dupAccept) L = I;
          };
        };
      };
      Index.set(L);
      return Result;
    };
    this.Insert = function (Index, S) {
      if (this.FSortStyle === $mod.TStringsSortStyle.sslAuto) {
        this.Error(rtl.getResStr(pas.RTLConsts,"SSortedListError"),0)}
       else {
        if ((Index < 0) || (Index > this.FCount)) this.Error(rtl.getResStr(pas.RTLConsts,"SListIndexError"),Index);
        this.InsertItem(Index,S);
      };
    };
  });
  $mod.$implcode = function () {
    $impl.ClassList = null;
  };
  $mod.$init = function () {
    $impl.ClassList = new Object();
  };
},[]);
rtl.module("Generics.Strings",["System"],function () {
  "use strict";
  var $mod = this;
  $mod.$resourcestrings = {SArgumentOutOfRange: {org: "Argument out of range"}};
});
rtl.module("Generics.Defaults",["System"],function () {
  "use strict";
  var $mod = this;
  rtl.createInterface(this,"IComparer$G23","{505778ED-F783-4456-9691-32F419CC5E18}",["Compare"],pas.System.IUnknown,"IComparer<System.Longint>");
  rtl.createInterface(this,"IComparer$G27","{505778ED-F783-4456-9691-32F419CC5E18}",["Compare"],pas.System.IUnknown,"IComparer<uPart.TPart>");
});
rtl.module("Generics.Collections",["System","Classes","SysUtils","RTLConsts","Types","JS","Generics.Strings","Generics.Defaults"],function () {
  "use strict";
  var $mod = this;
  this.TCollectionNotification = {"0": "cnAdded", cnAdded: 0, "1": "cnRemoved", cnRemoved: 1, "2": "cnExtracted", cnExtracted: 2};
  rtl.createClass(this,"TEnumerator$G19",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uVectorImage.TVectorCommand>");
  rtl.createClass(this,"TEnumerable$G18",pas.System.TObject,function () {
  },"TEnumerable<uVectorImage.TVectorCommand>");
  rtl.createClass(this,"TCustomList$G11",this.TEnumerable$G18,function () {
    this.$init = function () {
      $mod.TEnumerable$G18.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G18.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uVectorImage.TVectorCommand>");
  rtl.createClass(this,"TCustomListEnumerator$G9",this.TEnumerator$G19,function () {
    this.$init = function () {
      $mod.TEnumerator$G19.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G19.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uVectorImage.TVectorCommand>");
  rtl.createClass(this,"TList$G4",this.TCustomList$G11,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G9,function () {
    },"TList<uVectorImage.TVectorCommand>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uVectorImage.TVectorCommand>");
  rtl.createClass(this,"TEnumerable$G19",pas.System.TObject,function () {
  },"TEnumerable<uSolvedState.TFaceProperties>");
  rtl.createClass(this,"TCustomList$G12",this.TEnumerable$G19,function () {
    this.$init = function () {
      $mod.TEnumerable$G19.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G19.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uSolvedState.TFaceProperties>");
  rtl.createClass(this,"TList$G5",this.TCustomList$G12,function () {
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
  },"TList<uSolvedState.TFaceProperties>");
  rtl.createClass(this,"TEnumerable$G20",pas.System.TObject,function () {
  },"TEnumerable<uSolvedState.TSolvedState>");
  rtl.createClass(this,"TCustomList$G13",this.TEnumerable$G20,function () {
    this.$init = function () {
      $mod.TEnumerable$G20.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G20.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uSolvedState.TSolvedState>");
  rtl.createClass(this,"TList$G6",this.TCustomList$G13,function () {
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uSolvedState.TSolvedState>");
  rtl.createClass(this,"TEnumerator$G22",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uVector.TVector>");
  rtl.createClass(this,"TEnumerable$G21",pas.System.TObject,function () {
    this.GetEnumerator = function () {
      var Result = null;
      Result = this.DoGetEnumerator();
      return Result;
    };
  },"TEnumerable<uVector.TVector>");
  rtl.createClass(this,"TCustomList$G14",this.TEnumerable$G21,function () {
    this.$init = function () {
      $mod.TEnumerable$G21.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G21.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(pas.uVector.TVector.$new());
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
    this.DoRemove = function (AIndex, ACollectionNotification) {
      var Result = pas.uVector.TVector.$new();
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result.$assign(this.FItems[AIndex]);
      this.FLength -= 1;
      this.FItems[AIndex].$assign(pas.uVector.TVector.$new());
      this.FItems.splice(AIndex,1);
      this.Notify(Result,ACollectionNotification);
      return Result;
    };
  },"TCustomList<uVector.TVector>");
  rtl.createClass(this,"TCustomListEnumerator$G12",this.TEnumerator$G22,function () {
    this.$init = function () {
      $mod.TEnumerator$G22.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G22.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = pas.uVector.TVector.$new();
      Result.$assign(this.GetCurrent());
      return Result;
    };
    this.GetCurrent = function () {
      var Result = pas.uVector.TVector.$new();
      Result.$assign(this.FList.FItems[this.FIndex]);
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uVector.TVector>");
  rtl.createClass(this,"TList$G7",this.TCustomList$G14,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G12,function () {
    },"TList<uVector.TVector>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,pas.uVector.TVector,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.DoGetEnumerator = function () {
      var Result = null;
      Result = this.GetEnumerator$1();
      return Result;
    };
    this.GetItem = function (AIndex) {
      var Result = pas.uVector.TVector.$new();
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result.$assign(this.FItems[AIndex]);
      return Result;
    };
    this.SetItem = function (AIndex, AValue) {
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      this.Notify(this.FItems[AIndex],$mod.TCollectionNotification.cnRemoved);
      this.FItems[AIndex].$assign(AValue);
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result].$assign(AValue);
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.AddRange$2 = function (AEnumerable) {
      var LValue = pas.uVector.TVector.$new();
      var $in = AEnumerable.GetEnumerator();
      try {
        while ($in.MoveNext()) {
          LValue = $in.DoGetCurrent();
          this.Add(LValue);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.Delete = function (AIndex) {
      this.DoRemove(AIndex,$mod.TCollectionNotification.cnRemoved);
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uVector.TVector>");
  rtl.createClass(this,"TEnumerator$G23",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<System.Longint>");
  rtl.createClass(this,"TEnumerable$G22",pas.System.TObject,function () {
    this.GetEnumerator = function () {
      var Result = null;
      Result = this.DoGetEnumerator();
      return Result;
    };
  },"TEnumerable<System.Longint>");
  rtl.createClass(this,"TCustomList$G15",this.TEnumerable$G22,function () {
    this.$init = function () {
      $mod.TEnumerable$G22.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G22.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(-2147483648);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
    this.DoRemove = function (AIndex, ACollectionNotification) {
      var Result = 0;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      this.FLength -= 1;
      this.FItems[AIndex] = -2147483648;
      this.FItems.splice(AIndex,1);
      this.Notify(Result,ACollectionNotification);
      return Result;
    };
  },"TCustomList<System.Longint>");
  rtl.createClass(this,"TCustomListEnumerator$G13",this.TEnumerator$G23,function () {
    this.$init = function () {
      $mod.TEnumerator$G23.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G23.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = 0;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = 0;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<System.Longint>");
  rtl.createClass(this,"TList$G8",this.TCustomList$G15,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G13,function () {
    },"TList<System.Longint>.TEnumerator");
    this.$init = function () {
      $mod.TCustomList$G15.$init.call(this);
      this.FComparer = null;
    };
    this.$final = function () {
      rtl.setIntfP(this,"FComparer",null);
      $mod.TCustomList$G15.$final.call(this);
    };
    this.SameValue = function (Left, Right) {
      var Result = false;
      if (this.FComparer != null) {
        Result = this.FComparer.Compare(Left,Right) === 0}
       else Result = Left === Right;
      return Result;
    };
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,0,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.DoGetEnumerator = function () {
      var Result = null;
      Result = this.GetEnumerator$1();
      return Result;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.AddRange$2 = function (AEnumerable) {
      var LValue = 0;
      var $in = AEnumerable.GetEnumerator();
      try {
        while ($in.MoveNext()) {
          LValue = $in.DoGetCurrent();
          this.Add(LValue);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.Remove = function (AValue) {
      var Result = 0;
      Result = this.IndexOf(AValue);
      if (Result >= 0) this.DoRemove(Result,$mod.TCollectionNotification.cnRemoved);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
    this.Contains = function (AValue) {
      var Result = false;
      Result = this.IndexOf(AValue) >= 0;
      return Result;
    };
    this.IndexOf = function (AValue) {
      var Result = 0;
      var i = 0;
      for (var $l = 0, $end = this.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (this.SameValue(AValue,this.FItems[i])) return i;
      };
      Result = -1;
      return Result;
    };
  },"TList<System.Longint>");
  rtl.createClass(this,"TEnumerator$G24",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uFace.TFaceVertex>");
  rtl.createClass(this,"TEnumerable$G23",pas.System.TObject,function () {
    this.GetEnumerator = function () {
      var Result = null;
      Result = this.DoGetEnumerator();
      return Result;
    };
  },"TEnumerable<uFace.TFaceVertex>");
  rtl.createClass(this,"TCustomList$G16",this.TEnumerable$G23,function () {
    this.$init = function () {
      $mod.TEnumerable$G23.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G23.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(pas.uFace.TFaceVertex.$new());
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
    this.DoRemove = function (AIndex, ACollectionNotification) {
      var Result = pas.uFace.TFaceVertex.$new();
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result.$assign(this.FItems[AIndex]);
      this.FLength -= 1;
      this.FItems[AIndex].$assign(pas.uFace.TFaceVertex.$new());
      this.FItems.splice(AIndex,1);
      this.Notify(Result,ACollectionNotification);
      return Result;
    };
  },"TCustomList<uFace.TFaceVertex>");
  rtl.createClass(this,"TCustomListEnumerator$G14",this.TEnumerator$G24,function () {
    this.$init = function () {
      $mod.TEnumerator$G24.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G24.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = pas.uFace.TFaceVertex.$new();
      Result.$assign(this.GetCurrent());
      return Result;
    };
    this.GetCurrent = function () {
      var Result = pas.uFace.TFaceVertex.$new();
      Result.$assign(this.FList.FItems[this.FIndex]);
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uFace.TFaceVertex>");
  rtl.createClass(this,"TList$G9",this.TCustomList$G16,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G14,function () {
    },"TList<uFace.TFaceVertex>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,pas.uFace.TFaceVertex,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.DoGetEnumerator = function () {
      var Result = null;
      Result = this.GetEnumerator$1();
      return Result;
    };
    this.GetItem = function (AIndex) {
      var Result = pas.uFace.TFaceVertex.$new();
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result.$assign(this.FItems[AIndex]);
      return Result;
    };
    this.SetItem = function (AIndex, AValue) {
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      this.Notify(this.FItems[AIndex],$mod.TCollectionNotification.cnRemoved);
      this.FItems[AIndex].$assign(AValue);
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result].$assign(AValue);
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.AddRange$2 = function (AEnumerable) {
      var LValue = pas.uFace.TFaceVertex.$new();
      var $in = AEnumerable.GetEnumerator();
      try {
        while ($in.MoveNext()) {
          LValue = $in.DoGetCurrent();
          this.Add(LValue);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.Delete = function (AIndex) {
      this.DoRemove(AIndex,$mod.TCollectionNotification.cnRemoved);
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Move = function (AIndex, ANewIndex) {
      var Arr = null;
      var LTemp = undefined;
      var i = 0;
      if (ANewIndex === AIndex) return;
      if ((ANewIndex < 0) || (ANewIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Arr = this.FItems;
      LTemp = Arr[AIndex];
      if (AIndex < ANewIndex) {
        for (var $l = AIndex, $end = ANewIndex - 1; $l <= $end; $l++) {
          i = $l;
          Arr[i] = Arr[i + 1];
        }}
       else for (var $l1 = AIndex, $end1 = ANewIndex + 1; $l1 >= $end1; $l1--) {
        i = $l1;
        Arr[i] = Arr[i - 1];
      };
      Arr[ANewIndex] = LTemp;
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uFace.TFaceVertex>");
  rtl.createClass(this,"TEnumerator$G25",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uFace.TFace>");
  rtl.createClass(this,"TEnumerable$G24",pas.System.TObject,function () {
    this.GetEnumerator = function () {
      var Result = null;
      Result = this.DoGetEnumerator();
      return Result;
    };
  },"TEnumerable<uFace.TFace>");
  rtl.createClass(this,"TCustomList$G17",this.TEnumerable$G24,function () {
    this.$init = function () {
      $mod.TEnumerable$G24.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G24.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uFace.TFace>");
  rtl.createClass(this,"TCustomListEnumerator$G15",this.TEnumerator$G25,function () {
    this.$init = function () {
      $mod.TEnumerator$G25.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G25.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uFace.TFace>");
  rtl.createClass(this,"TList$G10",this.TCustomList$G17,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G15,function () {
    },"TList<uFace.TFace>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.DoGetEnumerator = function () {
      var Result = null;
      Result = this.GetEnumerator$1();
      return Result;
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.AddRange$2 = function (AEnumerable) {
      var LValue = null;
      var $in = AEnumerable.GetEnumerator();
      try {
        while ($in.MoveNext()) {
          LValue = $in.DoGetCurrent();
          this.Add(LValue);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uFace.TFace>");
  rtl.createClass(this,"TEnumerator$G26",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uFaceUtils.TVertex>");
  rtl.createClass(this,"TEnumerable$G25",pas.System.TObject,function () {
  },"TEnumerable<uFaceUtils.TVertex>");
  rtl.createClass(this,"TCustomList$G18",this.TEnumerable$G25,function () {
    this.$init = function () {
      $mod.TEnumerable$G25.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G25.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uFaceUtils.TVertex>");
  rtl.createClass(this,"TCustomListEnumerator$G16",this.TEnumerator$G26,function () {
    this.$init = function () {
      $mod.TEnumerator$G26.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G26.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uFaceUtils.TVertex>");
  rtl.createClass(this,"TList$G11",this.TCustomList$G18,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G16,function () {
    },"TList<uFaceUtils.TVertex>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.InternalInsert = function (AIndex, AValue) {
      if ((AIndex < 0) || (AIndex > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      this.FItems.splice(AIndex,0,AValue);
      this.FLength += 1;
      this.FItems[AIndex] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.SetItem = function (AIndex, AValue) {
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      this.Notify(this.FItems[AIndex],$mod.TCollectionNotification.cnRemoved);
      this.FItems[AIndex] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.Insert = function (AIndex, AValue) {
      if ((AIndex < 0) || (AIndex > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      this.InternalInsert(AIndex,AValue);
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
  },"TList<uFaceUtils.TVertex>");
  rtl.createClass(this,"TEnumerator$G27",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uPart.TPart>");
  rtl.createClass(this,"TEnumerable$G26",pas.System.TObject,function () {
    this.GetEnumerator = function () {
      var Result = null;
      Result = this.DoGetEnumerator();
      return Result;
    };
  },"TEnumerable<uPart.TPart>");
  rtl.createClass(this,"TCustomList$G19",this.TEnumerable$G26,function () {
    this.$init = function () {
      $mod.TEnumerable$G26.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G26.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
    this.DoRemove = function (AIndex, ACollectionNotification) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      this.FLength -= 1;
      this.FItems[AIndex] = null;
      this.FItems.splice(AIndex,1);
      this.Notify(Result,ACollectionNotification);
      return Result;
    };
  },"TCustomList<uPart.TPart>");
  rtl.createClass(this,"TCustomListEnumerator$G17",this.TEnumerator$G27,function () {
    this.$init = function () {
      $mod.TEnumerator$G27.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G27.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uPart.TPart>");
  rtl.createClass(this,"TList$G12",this.TCustomList$G19,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G17,function () {
    },"TList<uPart.TPart>.TEnumerator");
    this.$init = function () {
      $mod.TCustomList$G19.$init.call(this);
      this.FComparer = null;
    };
    this.$final = function () {
      rtl.setIntfP(this,"FComparer",null);
      $mod.TCustomList$G19.$final.call(this);
    };
    this.SameValue = function (Left, Right) {
      var Result = false;
      if (this.FComparer != null) {
        Result = this.FComparer.Compare(Left,Right) === 0}
       else Result = Left === Right;
      return Result;
    };
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.InternalInsert = function (AIndex, AValue) {
      if ((AIndex < 0) || (AIndex > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      this.FItems.splice(AIndex,0,AValue);
      this.FLength += 1;
      this.FItems[AIndex] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
    };
    this.DoGetEnumerator = function () {
      var Result = null;
      Result = this.GetEnumerator$1();
      return Result;
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.InsertRange$2 = function (AIndex, AEnumerable) {
      var LValue = null;
      var i = 0;
      if ((AIndex < 0) || (AIndex > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      i = 0;
      var $in = AEnumerable.GetEnumerator();
      try {
        while ($in.MoveNext()) {
          LValue = $in.DoGetCurrent();
          this.InternalInsert(AIndex + i,LValue);
          i += 1;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.Delete = function (AIndex) {
      this.DoRemove(AIndex,$mod.TCollectionNotification.cnRemoved);
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
    this.IndexOf = function (AValue) {
      var Result = 0;
      var i = 0;
      for (var $l = 0, $end = this.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (this.SameValue(AValue,this.FItems[i])) return i;
      };
      Result = -1;
      return Result;
    };
  },"TList<uPart.TPart>");
  rtl.createClass(this,"TEnumerator$G28",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uLayer.TLayer>");
  rtl.createClass(this,"TEnumerable$G27",pas.System.TObject,function () {
  },"TEnumerable<uLayer.TLayer>");
  rtl.createClass(this,"TCustomList$G20",this.TEnumerable$G27,function () {
    this.$init = function () {
      $mod.TEnumerable$G27.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G27.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uLayer.TLayer>");
  rtl.createClass(this,"TCustomListEnumerator$G18",this.TEnumerator$G28,function () {
    this.$init = function () {
      $mod.TEnumerator$G28.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G28.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uLayer.TLayer>");
  rtl.createClass(this,"TList$G13",this.TCustomList$G20,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G18,function () {
    },"TList<uLayer.TLayer>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uLayer.TLayer>");
  rtl.createClass(this,"TEnumerator$G29",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uAxis.TAxis>");
  rtl.createClass(this,"TEnumerable$G28",pas.System.TObject,function () {
  },"TEnumerable<uAxis.TAxis>");
  rtl.createClass(this,"TCustomList$G21",this.TEnumerable$G28,function () {
    this.$init = function () {
      $mod.TEnumerable$G28.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G28.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uAxis.TAxis>");
  rtl.createClass(this,"TCustomListEnumerator$G19",this.TEnumerator$G29,function () {
    this.$init = function () {
      $mod.TEnumerator$G29.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G29.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uAxis.TAxis>");
  rtl.createClass(this,"TList$G14",this.TCustomList$G21,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G19,function () {
    },"TList<uAxis.TAxis>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uAxis.TAxis>");
  rtl.createClass(this,"TEnumerable$G29",pas.System.TObject,function () {
  },"TEnumerable<uTexture.TTexture>");
  rtl.createClass(this,"TCustomList$G22",this.TEnumerable$G29,function () {
    this.$init = function () {
      $mod.TEnumerable$G29.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G29.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uTexture.TTexture>");
  rtl.createClass(this,"TList$G15",this.TCustomList$G22,function () {
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uTexture.TTexture>");
  rtl.createClass(this,"TEnumerable$G30",pas.System.TObject,function () {
  },"TEnumerable<uMacro.TMacro>");
  rtl.createClass(this,"TCustomList$G23",this.TEnumerable$G30,function () {
    this.$init = function () {
      $mod.TEnumerable$G30.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G30.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<uMacro.TMacro>");
  rtl.createClass(this,"TList$G16",this.TCustomList$G23,function () {
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uMacro.TMacro>");
  rtl.createClass(this,"TEnumerator$G32",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<uTurn.TTurn>");
  rtl.createClass(this,"TEnumerable$G31",pas.System.TObject,function () {
  },"TEnumerable<uTurn.TTurn>");
  rtl.createClass(this,"TCustomList$G24",this.TEnumerable$G31,function () {
    this.$init = function () {
      $mod.TEnumerable$G31.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G31.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
    this.DoRemove = function (AIndex, ACollectionNotification) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      this.FLength -= 1;
      this.FItems[AIndex] = null;
      this.FItems.splice(AIndex,1);
      this.Notify(Result,ACollectionNotification);
      return Result;
    };
  },"TCustomList<uTurn.TTurn>");
  rtl.createClass(this,"TCustomListEnumerator$G22",this.TEnumerator$G32,function () {
    this.$init = function () {
      $mod.TEnumerator$G32.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G32.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<uTurn.TTurn>");
  rtl.createClass(this,"TList$G17",this.TCustomList$G24,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G22,function () {
    },"TList<uTurn.TTurn>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.Delete = function (AIndex) {
      this.DoRemove(AIndex,$mod.TCollectionNotification.cnRemoved);
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
    this.Clear = function () {
      this.SetCount(0);
      this.SetCapacity(0);
    };
  },"TList<uTurn.TTurn>");
  rtl.createClass(this,"TEnumerator$G34",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  },"TEnumerator<DOM.TDomNode>");
  rtl.createClass(this,"TEnumerable$G33",pas.System.TObject,function () {
  },"TEnumerable<DOM.TDomNode>");
  rtl.createClass(this,"TCustomList$G26",this.TEnumerable$G33,function () {
    this.$init = function () {
      $mod.TEnumerable$G33.$init.call(this);
      this.FOnNotify = null;
      this.FLength = 0;
      this.FItems = [];
    };
    this.$final = function () {
      this.FOnNotify = undefined;
      this.FItems = undefined;
      $mod.TEnumerable$G33.$final.call(this);
    };
    this.GetCapacity = function () {
      var Result = 0;
      Result = rtl.length(this.FItems);
      return Result;
    };
    this.PrepareAddingItem = function () {
      var Result = 0;
      if (this.FLength === rtl.length(this.FItems)) this.FItems.push(null);
      Result = this.FLength;
      this.FLength += 1;
      return Result;
    };
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  },"TCustomList<DOM.TDomNode>");
  rtl.createClass(this,"TCustomListEnumerator$G24",this.TEnumerator$G34,function () {
    this.$init = function () {
      $mod.TEnumerator$G34.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G34.$final.call(this);
    };
    this.DoMoveNext = function () {
      var Result = false;
      this.FIndex += 1;
      Result = (this.FList.FLength > 0) && (this.FIndex < this.FList.FLength);
      return Result;
    };
    this.DoGetCurrent = function () {
      var Result = null;
      Result = this.GetCurrent();
      return Result;
    };
    this.GetCurrent = function () {
      var Result = null;
      Result = this.FList.FItems[this.FIndex];
      return Result;
    };
    this.Create$1 = function (AList) {
      pas.System.TObject.Create.call(this);
      this.FIndex = -1;
      this.FList = AList;
      return this;
    };
  },"TCustomListEnumerator<DOM.TDomNode>");
  rtl.createClass(this,"TList$G19",this.TCustomList$G26,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G24,function () {
    },"TList<DOM.TDomNode>.TEnumerator");
    this.SetCapacity = function (AValue) {
      if (AValue < this.FLength) this.SetCount(AValue);
      this.FItems = rtl.arraySetLength(this.FItems,null,AValue);
    };
    this.SetCount = function (AValue) {
      if (AValue < 0) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      if (AValue > this.GetCapacity()) {
        this.SetCapacity(AValue)}
       else if (AValue < this.FLength) this.DeleteRange(AValue,this.FLength - AValue);
      this.FLength = AValue;
    };
    this.InitializeList = function () {
    };
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
      return Result;
    };
    this.GetEnumerator$1 = function () {
      var Result = null;
      Result = this.TEnumerator.$create("Create$1",[this]);
      return Result;
    };
    this.Create$1 = function () {
      this.InitializeList();
      return this;
    };
    this.Destroy = function () {
      this.SetCapacity(0);
    };
    this.Add = function (AValue) {
      var Result = 0;
      Result = this.PrepareAddingItem();
      this.FItems[Result] = AValue;
      this.Notify(AValue,$mod.TCollectionNotification.cnAdded);
      return Result;
    };
    this.DeleteRange = function (AIndex, ACount) {
      var LDeleted = [];
      var i = 0;
      if (ACount === 0) return;
      if ((ACount < 0) || (AIndex < 0) || ((AIndex + ACount) > this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      LDeleted = this.FItems.splice(AIndex,this.FLength);
      this.FLength -= ACount;
      for (var $l = 0, $end = rtl.length(LDeleted) - 1; $l <= $end; $l++) {
        i = $l;
        this.Notify(LDeleted[i],$mod.TCollectionNotification.cnRemoved);
      };
    };
  },"TList<DOM.TDomNode>");
});
rtl.module("uVector",["System","Classes","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.recNewT(this,"TVector",function () {
    this.x = 0.0;
    this.y = 0.0;
    this.z = 0.0;
    this.$eq = function (b) {
      return (this.x === b.x) && (this.y === b.y) && (this.z === b.z);
    };
    this.$assign = function (s) {
      this.x = s.x;
      this.y = s.y;
      this.z = s.z;
      return this;
    };
    this.Abs = function () {
      var Result = 0.0;
      Result = Math.sqrt(pas.System.Sqr$1(this.x) + pas.System.Sqr$1(this.y) + pas.System.Sqr$1(this.z));
      return Result;
    };
    this.Normalize = function () {
      var L = 0.0;
      L = this.Abs();
      if (Math.abs(L - 1) < 1e-8) return;
      if (L === 0) return;
      this.x = this.x / L;
      this.y = this.y / L;
      this.z = this.z / L;
    };
    this.IsNear = function (Vect) {
      var Result = false;
      Result = (Math.abs(this.x - Vect.x) + Math.abs(this.y - Vect.y) + Math.abs(this.z - Vect.z)) < 1E-4;
      return Result;
    };
    this.IsNearOpposite = function (Vect) {
      var Result = false;
      Result = (Math.abs(this.x + Vect.x) + Math.abs(this.y + Vect.y) + Math.abs(this.z + Vect.z)) < 1E-4;
      return Result;
    };
  });
  this.Vector = function (x, y, z) {
    var Result = $mod.TVector.$new();
    Result.x = x;
    Result.y = y;
    Result.z = z;
    return Result;
  };
  this.VectorAdd = function (ALeft, ARight) {
    var Result = $mod.TVector.$new();
    Result.x = ALeft.x + ARight.x;
    Result.y = ALeft.y + ARight.y;
    Result.z = ALeft.z + ARight.z;
    return Result;
  };
  this.VectorNegate = function (ALeft) {
    var Result = $mod.TVector.$new();
    Result.x = -ALeft.x;
    Result.y = -ALeft.y;
    Result.z = -ALeft.z;
    return Result;
  };
  this.VectorSubtract = function (ALeft, ARight) {
    var Result = $mod.TVector.$new();
    Result.x = ALeft.x - ARight.x;
    Result.y = ALeft.y - ARight.y;
    Result.z = ALeft.z - ARight.z;
    return Result;
  };
  this.VectorScale = function (V, Scalar) {
    var Result = $mod.TVector.$new();
    Result.x = V.x * Scalar;
    Result.y = V.y * Scalar;
    Result.z = V.z * Scalar;
    return Result;
  };
  this.VectorCross = function (ALeft, ARight) {
    var Result = $mod.TVector.$new();
    Result.x = (ALeft.y * ARight.z) - (ALeft.z * ARight.y);
    Result.y = (ALeft.z * ARight.x) - (ALeft.x * ARight.z);
    Result.z = (ALeft.x * ARight.y) - (ALeft.y * ARight.x);
    return Result;
  };
  this.VectorDivide = function (V, Scalar) {
    var Result = $mod.TVector.$new();
    Result.x = V.x / Scalar;
    Result.y = V.y / Scalar;
    Result.z = V.z / Scalar;
    return Result;
  };
  this.VectorDot = function (ALeft, ARight) {
    var Result = 0.0;
    Result = (ALeft.x * ARight.x) + (ALeft.y * ARight.y) + (ALeft.z * ARight.z);
    return Result;
  };
  $mod.$implcode = function () {
    $impl.DELTA = 1e-4;
  };
},[]);
rtl.module("uMatrix",["System","uVector"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.T4x4Matrix$clone = function (a) {
    var b = [];
    b.length = 4;
    for (var c = 0; c < 4; c++) b[c] = a[c].slice(0);
    return b;
  };
  rtl.createClass(this,"TMatrix",pas.System.TObject,function () {
    this.GetMoveMatrix = function (d) {
      var Result = rtl.arraySetLength(null,0.0,4,4);
      Result = $mod.T4x4Matrix$clone($impl.FSingleMatrix);
      Result[3][0] = d.x;
      Result[3][1] = d.y;
      Result[3][2] = d.z;
      return Result;
    };
    this.GetRotateMatrix$1 = function (V, Al) {
      var Result = rtl.arraySetLength(null,0.0,4,4);
      var s = 0.0;
      var c = 0.0;
      var t = 0.0;
      s = Math.sin(Al);
      c = Math.cos(Al);
      t = 1 - c;
      Result = $mod.T4x4Matrix$clone($impl.FSingleMatrix);
      Result[0][0] = (t * V.x * V.x) + c;
      Result[1][0] = (t * V.x * V.y) - (s * V.z);
      Result[2][0] = (t * V.x * V.z) + (s * V.y);
      Result[0][1] = (t * V.x * V.y) + (s * V.z);
      Result[1][1] = (t * V.y * V.y) + c;
      Result[2][1] = (t * V.y * V.z) - (s * V.x);
      Result[0][2] = (t * V.x * V.z) - (s * V.y);
      Result[1][2] = (t * V.z * V.y) + (s * V.x);
      Result[2][2] = (t * V.z * V.z) + c;
      return Result;
    };
    this.GetScaleMatrix = function (dx, dy, dz) {
      var Result = rtl.arraySetLength(null,0.0,4,4);
      Result = $mod.T4x4Matrix$clone($impl.FSingleMatrix);
      Result[0][0] = dx;
      Result[1][1] = dy;
      Result[2][2] = dz;
      return Result;
    };
    this.Mult = function (a, b) {
      var Result = rtl.arraySetLength(null,0.0,4,4);
      var i = 0;
      var j = 0;
      var k = 0;
      var s = 0.0;
      for (j = 0; j <= 3; j++) for (i = 0; i <= 3; i++) {
        s = 0;
        for (k = 0; k <= 3; k++) s = s + (a[j][k] * b[k][i]);
        Result[j][i] = s;
      };
      return Result;
    };
    this.VectorMul = function (a, V) {
      var Result = pas.uVector.TVector.$new();
      var a1 = 0.0;
      var a2 = 0.0;
      var a3 = 0.0;
      var d = 0.0;
      a1 = (V.x * a[0][0]) + (V.y * a[1][0]) + (V.z * a[2][0]) + a[3][0];
      a2 = (V.x * a[0][1]) + (V.y * a[1][1]) + (V.z * a[2][1]) + a[3][1];
      a3 = (V.x * a[0][2]) + (V.y * a[1][2]) + (V.z * a[2][2]) + a[3][2];
      d = (V.x * a[0][3]) + (V.y * a[1][3]) + (V.z * a[2][3]) + a[3][3];
      if (d !== 0) {
        Result.x = a1 / d;
        Result.y = a2 / d;
        Result.z = a3 / d;
      } else {
        Result.x = 0;
        Result.y = 0;
        Result.z = 0;
      };
      return Result;
    };
  });
  $mod.$implcode = function () {
    $impl.FSingleMatrix = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
  };
},["SysUtils"]);
rtl.module("uLine",["System","uMatrix","uVector"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT(this,"TLine",function () {
    this.$new = function () {
      var r = Object.create(this);
      r.BaseVector = pas.uVector.TVector.$new();
      r.NormVector = pas.uVector.TVector.$new();
      return r;
    };
    this.$eq = function (b) {
      return this.BaseVector.$eq(b.BaseVector) && this.NormVector.$eq(b.NormVector);
    };
    this.$assign = function (s) {
      this.BaseVector.$assign(s.BaseVector);
      this.NormVector.$assign(s.NormVector);
      return this;
    };
    this.Trans = function (mat) {
      this.NormVector.$assign(pas.uVector.VectorAdd(this.NormVector,this.BaseVector));
      this.BaseVector.$assign(pas.uMatrix.TMatrix.VectorMul(mat,this.BaseVector));
      this.NormVector.$assign(pas.uMatrix.TMatrix.VectorMul(mat,this.NormVector));
      this.NormVector.$assign(pas.uVector.VectorSubtract(this.NormVector,this.BaseVector));
      this.NormVector.Normalize();
    };
  });
  this.DELTA = 1e-4;
},["uGeometryUtils"]);
rtl.module("uPlane",["System","uMatrix","uVector"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT(this,"TPlane",function () {
    this.NormDistance = 0.0;
    this.$new = function () {
      var r = Object.create(this);
      r.NormVect = pas.uVector.TVector.$new();
      return r;
    };
    this.$eq = function (b) {
      return this.NormVect.$eq(b.NormVect) && (this.NormDistance === b.NormDistance);
    };
    this.$assign = function (s) {
      this.NormVect.$assign(s.NormVect);
      this.NormDistance = s.NormDistance;
      return this;
    };
    this.TurnRound = function () {
      this.NormDistance = -this.NormDistance;
      this.NormVect.$assign(pas.uVector.VectorNegate(this.NormVect));
    };
    this.DistanceToPoint = function (Point) {
      var Result = 0.0;
      Result = pas.uVector.VectorDot(Point,this.NormVect) - this.NormDistance;
      return Result;
    };
  });
  this.Plane = function (NormVect, NormDistance) {
    var Result = $mod.TPlane.$new();
    Result.NormVect.$assign(NormVect);
    Result.NormDistance = NormDistance;
    return Result;
  };
});
rtl.module("uGeometryUtils",["System","uLine","uVector","uPlane"],function () {
  "use strict";
  var $mod = this;
  this.THalfOfPlane = {"0": "hopInPlane", hopInPlane: 0, "1": "hopInside", hopInside: 1, "2": "hopOutside", hopOutside: 2, "3": "hopIntersect", hopIntersect: 3};
  rtl.createClass(this,"TGeometryUtils",pas.System.TObject,function () {
    this.DistancePointToPlane = function (Plane, Point) {
      var Result = 0.0;
      Result = pas.uVector.VectorDot(pas.uVector.VectorSubtract(Point,pas.uVector.VectorScale(Plane.NormVect,Plane.NormDistance)),Plane.NormVect);
      return Result;
    };
  });
});
rtl.module("Graphics",["System"],function () {
  "use strict";
  var $mod = this;
  this.RGB = function (R, G, B) {
    var Result = 0;
    Result = rtl.lw(rtl.lw(R | rtl.lw(G << 8)) | rtl.lw(B << 16)) & 0xFFFFFFFF;
    return Result;
  };
});
rtl.module("uFaceUtils",["System","uFace","uPlane","uVector","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"TFaceUtils",pas.System.TObject,function () {
    this.IsSameAsPrev = function (Face, idx) {
      var Result = false;
      var v0 = pas.uVector.TVector.$new();
      var v1 = pas.uVector.TVector.$new();
      Result = Face.GetVertexIndex(idx) === Face.GetVertexIndex(idx - 1);
      if (Result) return Result;
      v0.$assign(Face.GetVertex(idx));
      v1.$assign(Face.GetVertex(idx - 1));
      Result = v0.IsNear(v1);
      return Result;
    };
    this.IsStraightAngle = function (Face, idx) {
      var Result = false;
      var v0 = pas.uVector.TVector.$new();
      var v1 = pas.uVector.TVector.$new();
      var v2 = pas.uVector.TVector.$new();
      v0.$assign(Face.GetVertex(idx));
      v1.$assign(pas.uVector.VectorSubtract(v0,Face.GetVertex(idx - 1)));
      v2.$assign(pas.uVector.VectorSubtract(Face.GetVertex(idx + 1),v0));
      v1.Normalize();
      v2.Normalize();
      Result = v1.IsNear(v2);
      return Result;
    };
    this.IsZeroAngle = function (Face, idx) {
      var Result = false;
      var v0 = pas.uVector.TVector.$new();
      var v1 = pas.uVector.TVector.$new();
      var v2 = pas.uVector.TVector.$new();
      v0.$assign(Face.GetVertex(idx));
      v1.$assign(pas.uVector.VectorSubtract(v0,Face.GetVertex(idx - 1)));
      v2.$assign(pas.uVector.VectorSubtract(v0,Face.GetVertex(idx + 1)));
      v1.Normalize();
      v2.Normalize();
      Result = v1.IsNear(v2);
      return Result;
    };
    this.CalculateBaseVertex = function (Face) {
      var Result = 0;
      var i = 0;
      var n = 0;
      var iX = 0;
      var iY = 0;
      var iZ = 0;
      var XMin = 0.0;
      var XMax = 0.0;
      var YMin = 0.0;
      var YMax = 0.0;
      var ZMin = 0.0;
      var ZMax = 0.0;
      var dX = 0.0;
      var dY = 0.0;
      var dZ = 0.0;
      Result = -1;
      n = Face.GetVertexCount();
      if (n < 3) return Result;
      var $with = Face.GetVertex(0);
      XMin = $with.x;
      XMax = $with.x;
      YMin = $with.y;
      YMax = $with.y;
      ZMin = $with.z;
      ZMax = $with.z;
      iX = 0;
      iY = 0;
      iZ = 0;
      for (var $l = 1, $end = n - 1; $l <= $end; $l++) {
        i = $l;
        var $with1 = Face.GetVertex(i);
        if ($with1.x < XMin) {
          XMin = $with1.x;
          iX = i;
        };
        if ($with1.x > XMax) XMax = $with1.x;
        if ($with1.y < YMin) {
          YMin = $with1.y;
          iY = i;
        };
        if ($with1.y > YMax) YMax = $with1.y;
        if ($with1.z < ZMin) {
          ZMin = $with1.z;
          iZ = i;
        };
        if ($with1.z > ZMax) ZMax = $with1.z;
      };
      dX = Math.abs(XMax - XMin);
      dY = Math.abs(YMax - YMin);
      dZ = Math.abs(ZMax - ZMin);
      if ((dX >= dY) && (dX >= dZ)) {
        Result = iX}
       else if ((dY >= dX) && (dY >= dZ)) {
        Result = iY}
       else Result = iZ;
      for (var $l1 = 0, $end1 = n - 1; $l1 <= $end1; $l1++) {
        i = $l1;
        if (!$mod.TFaceUtils.IsStraightAngle(Face,Result + i)) {
          Result = (Result + i) % n;
          return Result;
        };
      };
      return Result;
    };
    this.IsFaceConvex = function (Face) {
      var Result = false;
      var nv = pas.uVector.TVector.$new();
      var v = pas.uVector.TVector.$new();
      var i = 0;
      var n = 0;
      var v0 = pas.uVector.TVector.$new();
      var v1 = pas.uVector.TVector.$new();
      var v2 = pas.uVector.TVector.$new();
      Result = false;
      nv.$assign($mod.TFaceUtils.CalculateNormal(Face));
      n = Face.GetVertexCount();
      for (var $l = 0, $end = n - 1; $l <= $end; $l++) {
        i = $l;
        v0.$assign(Face.GetVertex(i));
        v1.$assign(Face.GetVertex(i + 1));
        v2.$assign(Face.GetVertex(i + 2));
        v.$assign(pas.uVector.VectorCross(pas.uVector.VectorSubtract(v0,v1),pas.uVector.VectorSubtract(v2,v1)));
        if (pas.uVector.VectorDot(v,nv) < 0) if (!$mod.TFaceUtils.IsStraightAngle(Face,i + 1)) return Result;
      };
      Result = true;
      return Result;
    };
    this.CutFace = function (Face, Plane, InvisibleSlice, NewFaces, NewVectors) {
      var Result = false;
      var FaceVertices = null;
      var CutVertices = null;
      function CalcNewVertex(i1, i2) {
        var Result = pas.uVector.TVector.$new();
        var c1 = null;
        var c2 = null;
        c1 = FaceVertices.GetItem(i1);
        c2 = FaceVertices.GetItem(i2);
        Result.$assign(pas.uVector.VectorAdd(c1.Vector,pas.uVector.VectorScale(pas.uVector.VectorSubtract(c2.Vector,c1.Vector),(0 - c1.Distance) / (c2.Distance - c1.Distance))));
        return Result;
      };
      var i = 0;
      var i2 = 0;
      var n = 0;
      var j = 0;
      var TempFace = null;
      var NewFace = null;
      var c = null;
      var c1 = null;
      var c2 = null;
      var first = null;
      var current = null;
      var slicePoint = null;
      var SortItem = null;
      var FreeItem = null;
      var PlaneVector = pas.uVector.TVector.$new();
      var IntersectionVector = pas.uVector.TVector.$new();
      var TempVectors = null;
      Result = false;
      if (Face.GetVertexCount() < 3) return Result;
      PlaneVector.$assign(pas.uVector.VectorScale(Plane.NormVect,Plane.NormDistance));
      IntersectionVector.$assign(pas.uVector.VectorCross(Plane.NormVect,Face.GetNorm()));
      IntersectionVector.Normalize();
      FaceVertices = pas["Generics.Collections"].TList$G11.$create("Create$1");
      CutVertices = pas["Generics.Collections"].TList$G11.$create("Create$1");
      try {
        for (var $l = 0, $end = Face.GetVertexCount() - 1; $l <= $end; $l++) {
          i = $l;
          c = $impl.TVertex.$create("Create$1");
          c.Vector.$assign(Face.GetVertex(i));
          c.InvisibleEdge = !Face.IsEdgeVisible(i);
          c.Distance = pas.uVector.VectorDot(Plane.NormVect,pas.uVector.VectorSubtract(c.Vector,PlaneVector));
          if (c.Distance < -4E-6) {
            c.typ = $impl.TVertexType.vtInside}
           else if (c.Distance > 4E-6) {
            c.typ = $impl.TVertexType.vtOutside}
           else {
            if (i > 0) {
              c.typ = FaceVertices.GetItem(i - 1).typ}
             else c.typ = $impl.TVertexType.vtSide;
          };
          FaceVertices.Add(c);
        };
        if ((FaceVertices.GetItem(0).typ === $impl.TVertexType.vtSide) && (c.typ !== $impl.TVertexType.vtSide)) {
          for (var $l1 = 0, $end1 = FaceVertices.FLength - 1; $l1 <= $end1; $l1++) {
            i = $l1;
            if (FaceVertices.GetItem(i).typ === $impl.TVertexType.vtSide) {
              FaceVertices.GetItem(i).typ = c.typ}
             else break;
          };
        };
        if (FaceVertices.GetItem(0).typ === $impl.TVertexType.vtSide) return Result;
        n = FaceVertices.FLength;
        for (var $l2 = n - 1; $l2 >= 0; $l2--) {
          i = $l2;
          i2 = i + 1;
          if (i2 === n) i2 = 0;
          if (FaceVertices.GetItem(i).typ !== FaceVertices.GetItem(i2).typ) {
            c1 = $impl.TVertex.$create("Create$1");
            c2 = $impl.TVertex.$create("Create$1");
            c1.Vector.$assign(CalcNewVertex(i,i2));
            c1.InvisibleEdge = FaceVertices.GetItem(i).InvisibleEdge;
            if (FaceVertices.GetItem(i).typ === $impl.TVertexType.vtOutside) {
              c1.typ = $impl.TVertexType.vtGoInside}
             else c1.typ = $impl.TVertexType.vtGoOutside;
            c1.LinkedPoint = c2;
            FaceVertices.Insert(i + 1,c1);
            c2.Vector.$assign(c1.Vector);
            c2.LinkedPoint = c1;
            CutVertices.Add(c2);
          };
        };
        for (var $l3 = 0, $end2 = FaceVertices.FLength - 2; $l3 <= $end2; $l3++) {
          i = $l3;
          FaceVertices.GetItem(i).Next = FaceVertices.GetItem(i + 1);
        };
        FaceVertices.GetItem(FaceVertices.FLength - 1).Next = FaceVertices.GetItem(0);
        var $in = CutVertices.GetEnumerator$1();
        try {
          while ($in.MoveNext()) {
            c = $in.DoGetCurrent();
            c.Distance = pas.uVector.VectorDot(c.Vector,IntersectionVector);
          }
        } finally {
          $in = rtl.freeLoc($in)
        };
        for (var $l4 = 1, $end3 = CutVertices.FLength - 1; $l4 <= $end3; $l4++) {
          i = $l4;
          SortItem = CutVertices.GetItem(i);
          j = i - 1;
          while ((j >= 0) && (CutVertices.GetItem(j).Distance > SortItem.Distance)) {
            CutVertices.SetItem(j + 1,CutVertices.GetItem(j));
            j -= 1;
          };
          CutVertices.SetItem(j + 1,SortItem);
        };
        for (var $l5 = 0, $end4 = CutVertices.FLength - 2; $l5 <= $end4; $l5++) {
          i = $l5;
          CutVertices.GetItem(i).Next = CutVertices.GetItem(i + 1);
          CutVertices.GetItem(i).InvisibleEdge = InvisibleSlice;
        };
        do {
          first = null;
          for (var $l6 = 0, $end5 = FaceVertices.FLength - 1; $l6 <= $end5; $l6++) {
            i = $l6;
            if ((FaceVertices.GetItem(i).typ === $impl.TVertexType.vtOutside) && !FaceVertices.GetItem(i).used) {
              first = FaceVertices.GetItem(i);
              break;
            };
          };
          if (first === null) break;
          TempVectors = pas["Generics.Collections"].TList$G7.$create("Create$1");
          TempFace = pas.uFace.TFace.$create("Create$1",[TempVectors]);
          current = first;
          do {
            current.used = true;
            TempFace.AddVector(pas.uVector.TVector.$clone(current.Vector),true);
            if (current.typ === $impl.TVertexType.vtGoInside) {
              TempFace.SetEdgeVisibility(TempFace.GetVertexCount() - 1,!InvisibleSlice);
              slicePoint = current.LinkedPoint;
              slicePoint = slicePoint.Next;
              current = slicePoint.LinkedPoint;
            } else {
              TempFace.SetEdgeVisibility(TempFace.GetVertexCount() - 1,!current.InvisibleEdge);
              current = current.Next;
            };
          } while (!((current === null) || (current === first) || current.used));
          TempFace.CheckFace();
          NewFace = pas.uFace.TFace.$create("Create$1",[NewVectors]);
          NewFace.Color = Face.Color;
          NewFaces.Add(NewFace);
          for (var $l7 = 0, $end6 = TempFace.GetVertexCount() - 1; $l7 <= $end6; $l7++) {
            i = $l7;
            NewFace.AddVector(pas.uVector.TVector.$clone(TempFace.GetVertex(i)),TempFace.IsEdgeVisible(i));
          };
          TempFace = rtl.freeLoc(TempFace);
          TempVectors = rtl.freeLoc(TempVectors);
          Result = true;
        } while (!(first === null));
      } finally {
        for (var $l8 = 0, $end7 = FaceVertices.FLength - 1; $l8 <= $end7; $l8++) {
          i = $l8;
          FreeItem = FaceVertices.GetItem(i);
          FreeItem = rtl.freeLoc(FreeItem);
        };
        FaceVertices = rtl.freeLoc(FaceVertices);
        for (var $l9 = 0, $end8 = CutVertices.FLength - 1; $l9 <= $end8; $l9++) {
          i = $l9;
          FreeItem = CutVertices.GetItem(i);
          FreeItem = rtl.freeLoc(FreeItem);
        };
        CutVertices = rtl.freeLoc(CutVertices);
      };
      return Result;
    };
    this.CalculateNormal = function (Face) {
      var Result = pas.uVector.TVector.$new();
      var idx = 0;
      var v0 = pas.uVector.TVector.$new();
      var v1 = pas.uVector.TVector.$new();
      var v2 = pas.uVector.TVector.$new();
      idx = $mod.TFaceUtils.CalculateBaseVertex(Face);
      v0.$assign(Face.GetVertex(idx - 1));
      v1.$assign(Face.GetVertex(idx));
      v2.$assign(Face.GetVertex(idx + 1));
      Result.$assign(pas.uVector.VectorCross(pas.uVector.VectorSubtract(v2,v1),pas.uVector.VectorSubtract(v0,v1)));
      Result.Normalize();
      return Result;
    };
  });
  $mod.$implcode = function () {
    $impl.DELTA = 0.000004;
    $impl.TVertexType = {"0": "vtInside", vtInside: 0, "1": "vtSide", vtSide: 1, "2": "vtOutside", vtOutside: 2, "3": "vtGoInside", vtGoInside: 3, "4": "vtGoOutside", vtGoOutside: 4};
    rtl.createClass($impl,"TVertex",pas.System.TObject,function () {
      this.$init = function () {
        pas.System.TObject.$init.call(this);
        this.Vector = pas.uVector.TVector.$new();
        this.typ = 0;
        this.LinkedPoint = null;
        this.Next = null;
        this.InvisibleEdge = false;
        this.used = false;
        this.Distance = 0.0;
      };
      this.$final = function () {
        this.Vector = undefined;
        this.LinkedPoint = undefined;
        this.Next = undefined;
        pas.System.TObject.$final.call(this);
      };
      this.Create$1 = function () {
        this.LinkedPoint = null;
        this.Next = null;
        this.InvisibleEdge = false;
        this.used = false;
        this.Distance = 0;
        return this;
      };
    });
  };
},["SysUtils","Generics.Defaults","Math"]);
rtl.module("uFace",["System","uVector","uGeometryUtils","uPlane","Graphics","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.TFaceType = {"0": "ftUnknown", ftUnknown: 0, "1": "ftConvex", ftConvex: 1, "2": "ftReflex", ftReflex: 2};
  rtl.recNewT(this,"TFaceVertex",function () {
    this.Index = 0;
    this.SegmentVisible = false;
    this.$eq = function (b) {
      return (this.Index === b.Index) && (this.SegmentVisible === b.SegmentVisible);
    };
    this.$assign = function (s) {
      this.Index = s.Index;
      this.SegmentVisible = s.SegmentVisible;
      return this;
    };
  });
  rtl.createClass(this,"TFace",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FPartVertices = null;
      this.FSpikes = null;
      this.FConvexity = 0;
      this.FNormalIndex = 0;
      this.FVertices = null;
      this.Color = 0;
      this.TextureId = 0;
      this.IsStickerVisible = false;
    };
    this.$final = function () {
      this.FPartVertices = undefined;
      this.FSpikes = undefined;
      this.FVertices = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.CheckConvexity = function () {
      if (!pas.uFaceUtils.TFaceUtils.IsFaceConvex(this)) {
        this.FConvexity = $mod.TFaceType.ftReflex}
       else this.FConvexity = $mod.TFaceType.ftConvex;
      this.FNormalIndex = pas.uFaceUtils.TFaceUtils.CalculateBaseVertex(this);
    };
    this.Create$1 = function (PartVectices) {
      pas.System.TObject.Create.call(this);
      this.FPartVertices = PartVectices;
      this.FVertices = pas["Generics.Collections"].TList$G9.$create("Create$1");
      this.FSpikes = pas["Generics.Collections"].TList$G8.$create("Create$1");
      this.FConvexity = $mod.TFaceType.ftUnknown;
      this.Color = -1;
      this.TextureId = -1;
      this.IsStickerVisible = true;
      this.Invalidate();
      return this;
    };
    this.Destroy = function () {
      this.Clear();
      rtl.free(this,"FSpikes");
      rtl.free(this,"FVertices");
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      this.Color = -1;
      this.FSpikes.Clear();
      this.FVertices.Clear();
      this.TextureId = -1;
      this.Invalidate();
    };
    this.Assign = function (Face) {
      var i = 0;
      this.Clear();
      this.Color = Face.Color;
      this.TextureId = Face.TextureId;
      if (this.FPartVertices === Face.FPartVertices) {
        this.FVertices.AddRange$2(Face.FVertices)}
       else for (var $l = 0, $end = Face.GetVertexCount() - 1; $l <= $end; $l++) {
        i = $l;
        this.AddVector(pas.uVector.TVector.$clone(Face.GetVertex(i)),Face.IsEdgeVisible(i));
      };
      this.FSpikes.AddRange$2(Face.FSpikes);
      this.FConvexity = Face.FConvexity;
    };
    this.IsColored = function () {
      var Result = false;
      Result = (this.Color !== -1) && this.IsStickerVisible;
      return Result;
    };
    this.Invalidate = function () {
      this.FConvexity = $mod.TFaceType.ftUnknown;
    };
    this.GetNorm = function () {
      var Result = pas.uVector.TVector.$new();
      var v0 = pas.uVector.TVector.$new();
      var v1 = pas.uVector.TVector.$new();
      var v2 = pas.uVector.TVector.$new();
      if (this.FConvexity === $mod.TFaceType.ftUnknown) this.CheckConvexity();
      v0.$assign(this.GetVertex(this.FNormalIndex - 1));
      v1.$assign(this.GetVertex(this.FNormalIndex));
      v2.$assign(this.GetVertex(this.FNormalIndex + 1));
      Result.$assign(pas.uVector.VectorCross(pas.uVector.VectorSubtract(v2,v1),pas.uVector.VectorSubtract(v0,v1)));
      Result.Normalize();
      return Result;
    };
    this.GetVertex = function (i) {
      var Result = pas.uVector.TVector.$new();
      var n = 0;
      n = this.FVertices.FLength;
      if (n === 0) {
        Result.$assign(pas.uVector.Vector(0,0,0));
        return Result;
      };
      while (i >= n) i -= n;
      while (i < 0) i += n;
      Result.$assign(this.FPartVertices.GetItem(this.FVertices.GetItem(i).Index));
      return Result;
    };
    this.GetVertexIndex = function (i) {
      var Result = 0;
      var n = 0;
      n = this.FVertices.FLength;
      while (i >= n) i -= n;
      while (i < 0) i += n;
      Result = this.FVertices.GetItem(i).Index;
      return Result;
    };
    this.GetVertexCount = function () {
      var Result = 0;
      Result = this.FVertices.FLength;
      return Result;
    };
    this.HalfPlane = function (Plane) {
      var Result = 0;
      var i = 0;
      var D = 0.0;
      var NormVect = pas.uVector.TVector.$new();
      var PlaneVect = pas.uVector.TVector.$new();
      Result = pas.uGeometryUtils.THalfOfPlane.hopInPlane;
      NormVect.$assign(Plane.NormVect);
      PlaneVect.$assign(pas.uVector.VectorScale(NormVect,Plane.NormDistance));
      for (var $l = 0, $end = this.GetVertexCount() - 1; $l <= $end; $l++) {
        i = $l;
        D = pas.uVector.VectorDot(pas.uVector.VectorSubtract(this.GetVertex(i),PlaneVect),NormVect);
        if (D > 2.5E-4) {
          if (Result === pas.uGeometryUtils.THalfOfPlane.hopInside) {
            Result = pas.uGeometryUtils.THalfOfPlane.hopIntersect;
            return Result;
          };
          Result = pas.uGeometryUtils.THalfOfPlane.hopOutside;
        } else if (D < -2.5E-4) {
          if (Result === pas.uGeometryUtils.THalfOfPlane.hopOutside) {
            Result = pas.uGeometryUtils.THalfOfPlane.hopIntersect;
            return Result;
          };
          Result = pas.uGeometryUtils.THalfOfPlane.hopInside;
        };
      };
      return Result;
    };
    this.GetPlane = function () {
      var Result = pas.uPlane.TPlane.$new();
      Result.NormVect.$assign(this.GetNorm());
      Result.NormDistance = pas.uVector.VectorDot(Result.NormVect,this.GetVertex(0));
      return Result;
    };
    this.Rotate = function (n) {
      var i = 0;
      if (n > 0) {
        for (var $l = 0, $end = n - 1; $l <= $end; $l++) {
          i = $l;
          this.FVertices.Move(0,this.FVertices.FLength - 1);
        };
      } else if (n < 0) {
        for (var $l1 = 0, $end1 = -n - 1; $l1 <= $end1; $l1++) {
          i = $l1;
          this.FVertices.Move(this.FVertices.FLength - 1,0);
        };
      };
    };
    this.AddVector = function (v, Visible) {
      var Result = false;
      var i = 0;
      for (var $l = 0, $end = this.FPartVertices.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (this.FPartVertices.GetItem(i).IsNear(v)) {
          this.AddVertexByIndex(i,Visible);
          Result = true;
          return Result;
        };
      };
      this.FPartVertices.Add(v);
      this.AddVertexByIndex(this.FPartVertices.FLength - 1,Visible);
      Result = false;
      return Result;
    };
    this.AddVertexByIndex = function (idx, SegmentVisible) {
      var Vertex = $mod.TFaceVertex.$new();
      if ((this.FVertices.FLength === 0) || (idx !== this.FVertices.GetItem(this.FVertices.FLength - 1).Index)) {
        Vertex.Index = idx;
        Vertex.SegmentVisible = SegmentVisible;
        this.FVertices.Add(Vertex);
      };
    };
    this.IsEdgeVisible = function (idx) {
      var Result = false;
      Result = this.FVertices.GetItem(idx).SegmentVisible;
      return Result;
    };
    this.AllEdgesVisible = function () {
      var Result = false;
      var i = 0;
      Result = false;
      for (var $l = 0, $end = this.FVertices.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (!this.FVertices.GetItem(i).SegmentVisible) return Result;
      };
      Result = true;
      return Result;
    };
    this.SetEdgeVisibility = function (idx, Visible) {
      var Vertex = $mod.TFaceVertex.$new();
      Vertex.$assign(this.FVertices.GetItem(idx));
      Vertex.SegmentVisible = Visible;
      this.FVertices.SetItem(idx,Vertex);
    };
    this.SetSpike = function (Level) {
      if (!this.FSpikes.Contains(Level)) this.FSpikes.Add(Level);
      if (this.FSpikes.Contains(-Level)) this.FSpikes.Remove(-Level);
    };
    this.CheckFace = function () {
      var idx = 0;
      idx = 0;
      while (idx < this.GetVertexCount()) {
        if (pas.uFaceUtils.TFaceUtils.IsSameAsPrev(this,idx) || pas.uFaceUtils.TFaceUtils.IsStraightAngle(this,idx) || pas.uFaceUtils.TFaceUtils.IsZeroAngle(this,idx)) {
          this.FVertices.Delete(idx);
          if (idx > 0) {
            idx -= 2}
           else idx -= 1;
        };
        idx += 1;
      };
    };
  });
  $mod.$implcode = function () {
    $impl.DELTA = 2.5e-4;
  };
},["uFaceUtils"]);
rtl.module("uPart",["System","uPlane","uMatrix","uVector","uFace","uGeometryUtils","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"TPart",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FVertices = null;
      this.FFaces = null;
      this.FVisible = false;
    };
    this.$final = function () {
      this.FVertices = undefined;
      this.FFaces = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.FVertices = pas["Generics.Collections"].TList$G7.$create("Create$1");
      this.FFaces = pas["Generics.Collections"].TList$G10.$create("Create$1");
      this.FVisible = true;
      return this;
    };
    this.Destroy = function () {
      this.Clear();
      rtl.free(this,"FFaces");
      rtl.free(this,"FVertices");
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      var Face = null;
      this.FVertices.Clear();
      var $in = this.FFaces.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Face = $in.DoGetCurrent();
          Face = rtl.freeLoc(Face);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      this.FFaces.Clear();
      this.FVisible = true;
    };
    this.Assign = function (Part) {
      var i = 0;
      var FaceSrc = null;
      var FaceDst = null;
      this.Clear();
      this.FVertices.AddRange$2(Part.FVertices);
      var $in = Part.FFaces.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          FaceSrc = $in.DoGetCurrent();
          FaceDst = pas.uFace.TFace.$create("Create$1",[this.FVertices]);
          try {
            FaceDst.Color = FaceSrc.Color;
            for (var $l = 0, $end = FaceSrc.GetVertexCount() - 1; $l <= $end; $l++) {
              i = $l;
              FaceDst.AddVertexByIndex(FaceSrc.GetVertexIndex(i),true);
              FaceDst.SetEdgeVisibility(i,FaceSrc.IsEdgeVisible(i));
            };
          } catch ($e) {
            FaceDst = rtl.freeLoc(FaceDst);
            throw $e;
          };
          this.FFaces.Add(FaceDst);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      this.FVisible = Part.FVisible;
    };
    this.AddVertex = function (V) {
      var Result = 0;
      var i = 0;
      for (var $l = 0, $end = this.FVertices.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (V.IsNear(this.FVertices.GetItem(i))) {
          Result = i;
          return Result;
        };
      };
      Result = this.FVertices.Add(V);
      return Result;
    };
    this.AddFace = function (idx) {
      var Result = null;
      var i = 0;
      Result = pas.uFace.TFace.$create("Create$1",[this.FVertices]);
      try {
        for (var $l = 0, $end = rtl.length(idx) - 1; $l <= $end; $l++) {
          i = $l;
          if (idx[i] < this.FVertices.FLength) {
            Result.AddVertexByIndex(idx[i],true)}
           else throw pas.SysUtils.Exception.$create("Create$1",["TPart.AddFace: invalid index"]);
        };
      } catch ($e) {
        Result = rtl.freeLoc(Result);
        throw $e;
      };
      this.FFaces.Add(Result);
      return Result;
    };
    this.HalfPlane = function (Plane) {
      var Result = 0;
      var D = 0.0;
      var Vertex = pas.uVector.TVector.$new();
      var NormVect = pas.uVector.TVector.$new();
      var PlaneVect = pas.uVector.TVector.$new();
      Result = pas.uGeometryUtils.THalfOfPlane.hopInPlane;
      NormVect.$assign(Plane.NormVect);
      PlaneVect.$assign(pas.uVector.VectorScale(NormVect,Plane.NormDistance));
      var $in = this.FVertices.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Vertex = $in.DoGetCurrent();
          D = pas.uVector.VectorDot(pas.uVector.VectorSubtract(Vertex,PlaneVect),NormVect);
          if (D > 2E-4) {
            if (Result === pas.uGeometryUtils.THalfOfPlane.hopInside) {
              Result = pas.uGeometryUtils.THalfOfPlane.hopIntersect;
              return Result;
            };
            Result = pas.uGeometryUtils.THalfOfPlane.hopOutside;
          } else if (D < -2E-4) {
            if (Result === pas.uGeometryUtils.THalfOfPlane.hopOutside) {
              Result = pas.uGeometryUtils.THalfOfPlane.hopIntersect;
              return Result;
            };
            Result = pas.uGeometryUtils.THalfOfPlane.hopInside;
          };
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      return Result;
    };
    this.Contains = function (Point) {
      var Result = false;
      var NormVec = pas.uVector.TVector.$new();
      var Vertex = pas.uVector.TVector.$new();
      var MinVec = pas.uVector.TVector.$new();
      var MaxVec = pas.uVector.TVector.$new();
      var Plane = pas.uPlane.TPlane.$new();
      var hf = 0;
      var Face = null;
      var d = 0.0;
      if ((this.FFaces.FLength === 0) || (this.FVertices.FLength === 0)) return false;
      MinVec.$assign(this.FVertices.GetItem(0));
      MaxVec.$assign(this.FVertices.GetItem(0));
      var $in = this.FVertices.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Vertex = $in.DoGetCurrent();
          if (Vertex.x > MaxVec.x) MaxVec.x = Vertex.x;
          if (Vertex.x < MinVec.x) MinVec.x = Vertex.x;
          if (Vertex.y > MaxVec.y) MaxVec.y = Vertex.y;
          if (Vertex.y < MinVec.y) MinVec.y = Vertex.y;
          if (Vertex.z > MaxVec.z) MaxVec.z = Vertex.z;
          if (Vertex.z < MinVec.z) MinVec.z = Vertex.z;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      if ((Point.x > (MaxVec.x + 2E-4)) || (Point.x < (MinVec.x - 2E-4)) || (Point.y > (MaxVec.y + 2E-4)) || (Point.y < (MinVec.y - 2E-4)) || (Point.z > (MaxVec.z + 2E-4)) || (Point.z < (MinVec.z - 2E-4))) return false;
      Result = true;
      var $in1 = this.FFaces.GetEnumerator$1();
      try {
        while ($in1.MoveNext()) {
          Face = $in1.DoGetCurrent();
          Plane.$assign(Face.GetPlane());
          NormVec.$assign(Plane.NormVect);
          d = pas.uVector.VectorDot(NormVec,pas.uVector.VectorSubtract(Point,pas.uVector.VectorScale(NormVec,Plane.NormDistance)));
          hf = this.HalfPlane(Plane);
          if ((d > 2E-4) && (hf === pas.uGeometryUtils.THalfOfPlane.hopInside)) return false;
          if (hf === pas.uGeometryUtils.THalfOfPlane.hopInPlane) {
            if ((d < 2E-4) && (d > -2E-4)) {
              Result = this.FlatContains(Point,NormVec)}
             else Result = false;
            break;
          };
        }
      } finally {
        $in1 = rtl.freeLoc($in1)
      };
      return Result;
    };
    this.Trans = function (Matrix) {
      var i = 0;
      for (var $l = 0, $end = this.FVertices.FLength - 1; $l <= $end; $l++) {
        i = $l;
        this.FVertices.SetItem(i,pas.uMatrix.TMatrix.VectorMul(Matrix,this.FVertices.GetItem(i)));
      };
    };
    this.FlatContains = function (Point, NormVec) {
      var Result = false;
      var Face = null;
      Result = true;
      var $in = this.FFaces.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Face = $in.DoGetCurrent();
          if (this.FaceContains(Point,NormVec,Face)) return Result;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      Result = false;
      return Result;
    };
    this.FaceContains = function (Point, NormVec, Face) {
      var Result = false;
      var d = 0.0;
      var i = 0;
      var V = pas.uVector.TVector.$new();
      Result = true;
      for (var $l = 0, $end = Face.GetVertexCount() - 1; $l <= $end; $l++) {
        i = $l;
        V.$assign(pas.uVector.VectorCross(pas.uVector.VectorSubtract(Face.GetVertex(i + 1),Face.GetVertex(i)),NormVec));
        V.Normalize();
        d = pas.uVector.VectorDot(V,pas.uVector.VectorSubtract(Point,Face.GetVertex(i)));
        if (d > 2E-4) {
          Result = false;
          break;
        };
      };
      return Result;
    };
  });
  $mod.$implcode = function () {
    $impl.DELTA = 2e-4;
  };
},["SysUtils"]);
rtl.module("uUtils",["System","Classes","Graphics"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TUtils",pas.System.TObject,function () {
    this.FLogProc = null;
    this.FLogWarningProc = null;
    this.Log = function (Mess) {
      if ($mod.TUtils.FLogProc != null) $mod.TUtils.FLogProc(Mess);
    };
    this.LogWarning = function (Mess) {
      if ($mod.TUtils.FLogWarningProc != null) $mod.TUtils.FLogWarningProc(Mess);
    };
    this.StrToColor = function (S) {
      var Result = 0;
      if (pas.System.Copy(S,1,1) === "-") {
        Result = pas.SysUtils.StrToInt(S)}
       else Result = pas.Graphics.RGB($mod.TUtils.HexToInt(pas.System.Copy(S,1,2)),$mod.TUtils.HexToInt(pas.System.Copy(S,3,2)),$mod.TUtils.HexToInt(pas.System.Copy(S,5,2)));
      return Result;
    };
    this.Trim = function (S) {
      var $Self = this;
      var Result = "";
      function TrimLeft(S) {
        var Result = "";
        var I = 0;
        var L = 0;
        L = S.length;
        I = 1;
        while ((I <= L) && (S.charAt(I - 1) <= " ")) I += 1;
        Result = pas.System.Copy(S,I,2147483647);
        return Result;
      };
      function TrimRight(S) {
        var Result = "";
        var I = 0;
        I = S.length;
        while ((I > 0) && (S.charAt(I - 1) <= " ")) I -= 1;
        Result = pas.System.Copy(S,1,I);
        return Result;
      };
      Result = TrimLeft(TrimRight(S));
      return Result;
    };
    this.Parse = function (S, Separators) {
      var $Self = this;
      var Result = "";
      function indexOfCharsMin(S, Chars) {
        var Result = 0;
        var i = 0;
        var j = 0;
        Result = -1;
        for (var $l = 1, $end = Chars.length; $l <= $end; $l++) {
          i = $l;
          j = pas.System.Pos(Chars.charAt(i - 1),S);
          if (j > 0) if ((Result < 0) || (j < Result)) Result = j;
        };
        return Result;
      };
      var Pos = 0;
      var Source = "";
      var SafeSeparators = "";
      Source = S.get();
      SafeSeparators = Separators;
      if (pas.JS.isNull(Source) || pas.JS.isUndefined(Source)) Source = "";
      if (pas.JS.isNull(SafeSeparators) || pas.JS.isUndefined(SafeSeparators)) SafeSeparators = "";
      if (SafeSeparators === "") {
        Result = Source;
        S.set("");
        return Result;
      };
      Pos = indexOfCharsMin(Source,SafeSeparators);
      if (Pos <= 0) Pos = Source.length + 1;
      Result = Source;
      S.set(pas.System.Copy(Result,Pos + 1,2147483647));
      Result = pas.System.Copy(Result,1,Pos - 1);
      return Result;
    };
    this.ParseInt = function (S) {
      var Result = 0;
      Result = pas.SysUtils.StrToIntDef(this.Trim(this.Parse(S,",")),0);
      return Result;
    };
    this.HexToInt = function (Value) {
      var Result = 0;
      var i = 0;
      Result = 0;
      i = 1;
      if (Value === "") return Result;
      if (Value.charAt(0) === "$") i += 1;
      while (i <= Value.length) {
        if ((Value.charAt(i - 1) >= "0") && (Value.charAt(i - 1) <= "9")) {
          Result = (Result << 4) | (Value.charCodeAt(i - 1) - 48)}
         else if ((Value.charAt(i - 1) >= "A") && (Value.charAt(i - 1) <= "F")) {
          Result = (Result << 4) | ((Value.charCodeAt(i - 1) - 65) + 10)}
         else if ((Value.charAt(i - 1) >= "a") && (Value.charAt(i - 1) <= "f")) {
          Result = (Result << 4) | ((Value.charCodeAt(i - 1) - 97) + 10)}
         else break;
        i += 1;
      };
      return Result;
    };
    var delta = 1e-5;
    this.PrivPi = function (Al) {
      var Result = 0.0;
      while (Al > Math.PI) Al = Al - (2 * Math.PI);
      while (Al < -Math.PI) Al = Al + (2 * Math.PI);
      if (Al < (-Math.PI + 1E-5)) Al = Math.PI;
      Result = Al;
      return Result;
    };
  });
  $mod.$init = function () {
  };
},["SysUtils","JS"]);
rtl.module("uLayer",["System","uMatrix","uPart","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"TLayer",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FTurningAngle = 0.0;
      this.DistanceFrom = 0.0;
      this.DistanceTo = 0.0;
      this.Fixed = false;
      this.Angle = 0.0;
      this.AvailableAngles = [];
      this.MinAngle = 0.0;
      this.MaxAngle = 0.0;
      this.ConnectedLayer = 0;
    };
    this.$final = function () {
      this.AvailableAngles = undefined;
      pas.System.TObject.$final.call(this);
    };
    var delta = 1e-6;
    this.SetTurningAngle = function (AAngle) {
      var i = 0;
      var N = 0;
      this.FTurningAngle = AAngle;
      if (AAngle === 0) return;
      this.Fixed = false;
      N = Math.round((2 * Math.PI) / AAngle);
      if (Math.abs((N * AAngle) - (2 * Math.PI)) > 1E-6) throw pas.SysUtils.Exception.$create("Create$1",["TLayer.SetTurningAngle: 2Pi is not divisible by " + pas.SysUtils.FloatToStr(AAngle)]);
      for (var $l = 0, $end = N - 1; $l <= $end; $l++) {
        i = $l;
        this.AddAvailableAngle(AAngle * i);
      };
    };
    this.Create$1 = function (ADistanceFrom, ADistanceTo) {
      pas.System.TObject.Create.call(this);
      this.DistanceFrom = ADistanceFrom;
      this.DistanceTo = ADistanceTo;
      this.Fixed = true;
      this.AvailableAngles = rtl.arraySetLength(this.AvailableAngles,0.0,0);
      this.MinAngle = -1e6;
      this.MaxAngle = 1e6;
      this.ConnectedLayer = -1;
      return this;
    };
    this.Destroy = function () {
      this.AvailableAngles = rtl.arraySetLength(this.AvailableAngles,0.0,0);
      pas.System.TObject.Destroy.call(this);
    };
    this.AddAngle = function (AAngle) {
      this.Angle = this.Angle + AAngle;
    };
    var Pi2 = Math.PI * 2;
    this.GetNextAngle = function (Al) {
      var Result = 0.0;
      var MaxA = 0.0;
      var i = 0;
      var loops = 0;
      if (rtl.length(this.AvailableAngles) === 0) {
        Result = Al;
        return Result;
      };
      Al = Al - 1E-4;
      loops = 0;
      MaxA = this.AvailableAngles[rtl.length(this.AvailableAngles) - 1];
      while (Al > MaxA) {
        Al = Al - Pi2;
        loops += 1;
      };
      while (Al <= (MaxA - Pi2)) {
        Al = Al + Pi2;
        loops -= 1;
      };
      for (var $l = 0, $end = rtl.length(this.AvailableAngles) - 1; $l <= $end; $l++) {
        i = $l;
        if (Al < this.AvailableAngles[i]) {
          Result = this.AvailableAngles[i] + (Pi2 * loops);
          return Result;
        };
      };
      Result = MaxA + (Pi2 * loops);
      return Result;
    };
    var Pi2$1 = Math.PI * 2;
    this.GetPrevAngle = function (Al) {
      var Result = 0.0;
      var MinA = 0.0;
      var i = 0;
      var loops = 0;
      if (rtl.length(this.AvailableAngles) === 0) {
        Result = Al;
        return Result;
      };
      Al = Al + 1E-4;
      loops = 0;
      MinA = this.AvailableAngles[0];
      while (Al < MinA) {
        Al = Al + Pi2$1;
        loops -= 1;
      };
      while (Al >= (MinA + Pi2$1)) {
        Al = Al - Pi2$1;
        loops += 1;
      };
      for (var $l = rtl.length(this.AvailableAngles) - 1; $l >= 0; $l--) {
        i = $l;
        if (Al > this.AvailableAngles[i]) {
          Result = this.AvailableAngles[i] + (Pi2$1 * loops);
          return Result;
        };
      };
      Result = MinA + (Pi2$1 * loops);
      return Result;
    };
    this.IsValidAngle = function (Al) {
      var Result = false;
      var i = 0;
      Result = true;
      Al = pas.uUtils.TUtils.PrivPi(Al);
      for (var $l = 0, $end = rtl.length(this.AvailableAngles) - 1; $l <= $end; $l++) {
        i = $l;
        if (Math.abs(pas.uUtils.TUtils.PrivPi(Al - this.AvailableAngles[i])) < 1E-4) return Result;
      };
      Result = false;
      return Result;
    };
    this.AddAvailableAngle = function (AAngle) {
      var i = 0;
      var d = 0.0;
      if (this.Fixed) return;
      AAngle = pas.uUtils.TUtils.PrivPi(AAngle);
      for (var $l = 0, $end = rtl.length(this.AvailableAngles) - 1; $l <= $end; $l++) {
        i = $l;
        if (Math.abs(pas.uUtils.TUtils.PrivPi(AAngle - this.AvailableAngles[i])) < 1E-4) return;
      };
      this.AvailableAngles = rtl.arraySetLength(this.AvailableAngles,0.0,rtl.length(this.AvailableAngles) + 1);
      this.AvailableAngles[rtl.length(this.AvailableAngles) - 1] = AAngle;
      for (var $l1 = rtl.length(this.AvailableAngles) - 1; $l1 >= 1; $l1--) {
        i = $l1;
        if (this.AvailableAngles[i] < this.AvailableAngles[i - 1]) {
          d = this.AvailableAngles[i];
          this.AvailableAngles[i] = this.AvailableAngles[i - 1];
          this.AvailableAngles[i - 1] = d;
        };
      };
    };
  });
  $mod.$implcode = function () {
    $impl.DELTA = 1e-4;
  };
},["uGeometryUtils","uUtils","SysUtils"]);
rtl.module("uAxis",["System","uLine","uLayer","uPlane","uVector","uMatrix","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TAxis",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.Line = pas.uLine.TLine.$new();
      this.Layers = null;
      this.ConnectedLayers = [];
      this.TurnAxesWithLayer = 0;
      this.TurnAxesWithPartNo = 0;
      this.Enabled = false;
    };
    this.$final = function () {
      this.Line = undefined;
      this.Layers = undefined;
      this.ConnectedLayers = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.GetNormVector = function () {
      var Result = pas.uVector.TVector.$new();
      Result.$assign(this.Line.NormVector);
      return Result;
    };
    this.GetBaseVector = function () {
      var Result = pas.uVector.TVector.$new();
      Result.$assign(this.Line.BaseVector);
      return Result;
    };
    this.Create$1 = function () {
      this.Enabled = true;
      this.Layers = pas["Generics.Collections"].TList$G13.$create("Create$1");
      this.TurnAxesWithLayer = -1;
      this.TurnAxesWithPartNo = -1;
      this.ConnectedLayers = rtl.arraySetLength(this.ConnectedLayers,[],0);
      return this;
    };
    this.Destroy = function () {
      this.Clear();
      rtl.free(this,"Layers");
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      var Layer = null;
      var $in = this.Layers.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Layer = $in.DoGetCurrent();
          Layer = rtl.freeLoc(Layer);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      this.Layers.Clear();
      this.ConnectedLayers = rtl.arraySetLength(this.ConnectedLayers,0,0,0);
    };
    this.GetRotateMatrix = function (Angle) {
      var Result = rtl.arraySetLength(null,0.0,4,4);
      Result = pas.uMatrix.TMatrix.GetMoveMatrix(pas.uVector.VectorNegate(this.GetBaseVector()));
      Result = pas.uMatrix.TMatrix.Mult(Result,pas.uMatrix.TMatrix.GetRotateMatrix$1(this.GetNormVector(),Angle));
      Result = pas.uMatrix.TMatrix.Mult(Result,pas.uMatrix.TMatrix.GetMoveMatrix(this.GetBaseVector()));
      return Result;
    };
    this.Trans = function (mat) {
      this.Line.Trans(pas.uMatrix.T4x4Matrix$clone(mat));
    };
    this.ConnectLayers = function (Layer1, Layer2) {
      var Result = false;
      var i = 0;
      var j = 0;
      var Found1 = 0;
      var Found2 = 0;
      Result = false;
      if (Layer2 === Layer1) return Result;
      Found1 = -1;
      for (var $l = 0, $end = rtl.length(this.ConnectedLayers) - 1; $l <= $end; $l++) {
        i = $l;
        for (var $l1 = 0, $end1 = rtl.length(this.ConnectedLayers[i]) - 1; $l1 <= $end1; $l1++) {
          j = $l1;
          if (this.ConnectedLayers[i][j] === Layer1) Found1 = i;
        };
      };
      Found2 = -1;
      for (var $l2 = 0, $end2 = rtl.length(this.ConnectedLayers) - 1; $l2 <= $end2; $l2++) {
        i = $l2;
        for (var $l3 = 0, $end3 = rtl.length(this.ConnectedLayers[i]) - 1; $l3 <= $end3; $l3++) {
          j = $l3;
          if (this.ConnectedLayers[i][j] === Layer2) Found2 = i;
        };
      };
      if ((Found1 >= 0) && (Found2 >= 0)) return Result;
      if ((Found1 >= 0) && (Found2 === -1)) {
        this.ConnectedLayers[Found1] = rtl.arraySetLength(this.ConnectedLayers[Found1],0,rtl.length(this.ConnectedLayers[Found1]) + 1);
        this.ConnectedLayers[Found1][rtl.length(this.ConnectedLayers[Found1]) - 1] = Layer2;
      };
      if ((Found2 >= 0) && (Found1 === -1)) {
        this.ConnectedLayers[Found2] = rtl.arraySetLength(this.ConnectedLayers[Found2],0,rtl.length(this.ConnectedLayers[Found2]) + 1);
        this.ConnectedLayers[Found2][rtl.length(this.ConnectedLayers[Found2]) - 1] = Layer1;
      };
      if ((Found1 === -1) && (Found2 === -1)) {
        this.ConnectedLayers = rtl.arraySetLength(this.ConnectedLayers,[],rtl.length(this.ConnectedLayers) + 1);
        this.ConnectedLayers[rtl.length(this.ConnectedLayers) - 1] = rtl.arraySetLength(this.ConnectedLayers[rtl.length(this.ConnectedLayers) - 1],0,2);
        this.ConnectedLayers[rtl.length(this.ConnectedLayers) - 1][0] = Layer1;
        this.ConnectedLayers[rtl.length(this.ConnectedLayers) - 1][1] = Layer2;
      };
      Result = true;
      return Result;
    };
    this.IsLayerFixed = function (ALayers) {
      var Result = false;
      var i = 0;
      Result = true;
      if (!this.Enabled) return Result;
      for (var $l = 0, $end = rtl.length(ALayers) - 1; $l <= $end; $l++) {
        i = $l;
        if (ALayers[i] && this.Layers.GetItem(i).Fixed) return Result;
      };
      Result = false;
      return Result;
    };
    this.CreateLayers = function (Distances) {
      var i = 0;
      var j = 0;
      var Count = 0;
      var Layer = null;
      var BaseDistance = 0.0;
      var TempDistance = 0.0;
      var FDistances = [];
      var $in = this.Layers.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Layer = $in.DoGetCurrent();
          Layer = rtl.freeLoc(Layer);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      this.Layers.Clear();
      if (rtl.length(Distances) > 0) {
        for (var $l = 1, $end = rtl.length(Distances) - 1; $l <= $end; $l++) {
          i = $l;
          TempDistance = Distances[i];
          j = i - 1;
          while ((j >= 0) && (Distances[j] > TempDistance)) {
            Distances[j + 1] = Distances[j];
            j -= 1;
          };
          Distances[j + 1] = TempDistance;
        };
        Count = 1;
        for (var $l1 = 0, $end1 = rtl.length(Distances) - 1 - 1; $l1 <= $end1; $l1++) {
          i = $l1;
          if ((Distances[i + 1] - Distances[i]) > 1E-4) Count += 1;
        };
        FDistances = rtl.arraySetLength(FDistances,0.0,Count);
        Count = 1;
        FDistances[0] = Distances[0];
        for (var $l2 = 0, $end2 = rtl.length(Distances) - 1 - 1; $l2 <= $end2; $l2++) {
          i = $l2;
          if ((Distances[i + 1] - Distances[i]) > 1E-4) {
            FDistances[Count] = Distances[i + 1];
            Count += 1;
          } else pas.uUtils.TUtils.LogWarning("Duplicated Distances");
        };
        BaseDistance = 0;
        this.Layers.Add(pas.uLayer.TLayer.$create("Create$1",[-1000,FDistances[0] + BaseDistance]));
        for (var $l3 = 0, $end3 = Count - 2; $l3 <= $end3; $l3++) {
          i = $l3;
          this.Layers.Add(pas.uLayer.TLayer.$create("Create$1",[FDistances[i] + BaseDistance,FDistances[i + 1] + BaseDistance]));
        };
        this.Layers.Add(pas.uLayer.TLayer.$create("Create$1",[FDistances[Count - 1] + BaseDistance,1000]));
      } else this.Layers.Add(pas.uLayer.TLayer.$create("Create$1",[-1000,1000]));
    };
    this.GetLayerPlaneTo = function (LayerNo) {
      var Result = pas.uPlane.TPlane.$new();
      Result.$assign(pas.uPlane.Plane(pas.uVector.TVector.$clone(this.GetNormVector()),this.Layers.GetItem(LayerNo).DistanceTo + pas.uVector.VectorDot(this.GetBaseVector(),this.GetNormVector())));
      return Result;
    };
  });
  this.INFINITE_LAYER_DISTANCE = 1000;
},["uUtils"]);
rtl.module("uPartUtils",["System","uPart","uPlane","uVector","uFace","Generics.Collections","Graphics"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"TPartUtils",pas.System.TObject,function () {
    this.SetFaceEdgesVisibility = function (Part, Face, InvisibleEdges) {
      var i = 0;
      var j = 0;
      var EdgeVisible = false;
      var v1 = 0;
      var v2 = 0;
      var TestFace = null;
      for (var $l = 0, $end = Face.GetVertexCount() - 1; $l <= $end; $l++) {
        i = $l;
        EdgeVisible = (InvisibleEdges & (1 << i)) === 0;
        Face.SetEdgeVisibility(i,EdgeVisible);
        v1 = Face.GetVertexIndex(i);
        v2 = Face.GetVertexIndex(i + 1);
        var $in = Part.FFaces.GetEnumerator$1();
        try {
          while ($in.MoveNext()) {
            TestFace = $in.DoGetCurrent();
            if (TestFace !== Face) for (var $l1 = 0, $end1 = TestFace.GetVertexCount() - 1; $l1 <= $end1; $l1++) {
              j = $l1;
              if ((TestFace.GetVertexIndex(j + 1) === v1) && (TestFace.GetVertexIndex(j) === v2)) TestFace.SetEdgeVisibility(j,EdgeVisible);
            };
          }
        } finally {
          $in = rtl.freeLoc($in)
        };
      };
    };
    this.CutPart = function (Part, Plane, NewParts, SliceColor, InvisibleEdges) {
      var Result = false;
      var Distances = [];
      var Segments1 = null;
      var Segments2 = null;
      var i = 0;
      var j = 0;
      var vi1 = 0;
      var vi2 = 0;
      var hp = 0;
      var NewPart = null;
      var Face = null;
      var NewFace = null;
      var NewFaces = null;
      var V0 = pas.uVector.TVector.$new();
      var V2 = pas.uVector.TVector.$new();
      var Found = false;
      NewPart = pas.uPart.TPart.$create("Create$1");
      NewParts.Add(NewPart);
      var $in = Part.FFaces.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Face = $in.DoGetCurrent();
          hp = Face.HalfPlane(pas.uPlane.TPlane.$clone(Plane));
          if ((hp === pas.uGeometryUtils.THalfOfPlane.hopOutside) || ((hp === pas.uGeometryUtils.THalfOfPlane.hopInPlane) && Plane.NormVect.IsNearOpposite(Face.GetNorm()))) {
            NewFace = pas.uFace.TFace.$create("Create$1",[NewPart.FVertices]);
            NewFace.Assign(Face);
            NewPart.FFaces.Add(NewFace);
          } else if (hp === pas.uGeometryUtils.THalfOfPlane.hopIntersect) {
            NewFaces = pas["Generics.Collections"].TList$G10.$create("Create$1");
            if (pas.uFaceUtils.TFaceUtils.CutFace(Face,pas.uPlane.TPlane.$clone(Plane),false,NewFaces,NewPart.FVertices)) NewPart.FFaces.AddRange$2(NewFaces);
            NewFaces = rtl.freeLoc(NewFaces);
          };
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      Distances = rtl.arraySetLength(Distances,0.0,NewPart.FVertices.FLength);
      for (var $l = 0, $end = NewPart.FVertices.FLength - 1; $l <= $end; $l++) {
        i = $l;
        Distances[i] = pas.uGeometryUtils.TGeometryUtils.DistancePointToPlane(Plane,NewPart.FVertices.GetItem(i));
      };
      Segments1 = pas["Generics.Collections"].TList$G7.$create("Create$1");
      Segments2 = pas["Generics.Collections"].TList$G7.$create("Create$1");
      try {
        for (var $l1 = 0, $end1 = NewPart.FFaces.FLength - 1; $l1 <= $end1; $l1++) {
          i = $l1;
          for (var $l2 = 0, $end2 = NewPart.FFaces.GetItem(i).GetVertexCount() - 1; $l2 <= $end2; $l2++) {
            j = $l2;
            var $with = NewPart.FFaces.GetItem(i);
            vi1 = $with.GetVertexIndex(j);
            vi2 = $with.GetVertexIndex(j + 1);
            if (pas.Math.IsZero(Distances[vi1],4.1666666666666669E-6) && pas.Math.IsZero(Distances[vi2],4.1666666666666669E-6)) {
              Segments2.Add($with.GetVertex(j));
              Segments1.Add($with.GetVertex(j + 1));
              $with.SetEdgeVisibility(j,true);
            };
          };
        };
        for (var $l3 = Segments1.FLength - 2; $l3 >= 0; $l3--) {
          i = $l3;
          for (var $l4 = Segments1.FLength - 1, $end3 = i + 1; $l4 >= $end3; $l4--) {
            j = $l4;
            if (Segments1.GetItem(i).IsNear(Segments2.GetItem(j)) && Segments1.GetItem(j).IsNear(Segments2.GetItem(i))) {
              Segments1.Delete(j);
              Segments2.Delete(j);
              Segments1.Delete(i);
              Segments2.Delete(i);
              break;
            };
          };
        };
        while (Segments1.FLength > 2) {
          NewFace = pas.uFace.TFace.$create("Create$1",[NewPart.FVertices]);
          NewFace.Color = SliceColor;
          V0.$assign(Segments1.GetItem(0));
          V2.$assign(Segments2.GetItem(0));
          NewFace.AddVector(pas.uVector.TVector.$clone(V0),true);
          Segments1.Delete(0);
          Segments2.Delete(0);
          do {
            Found = false;
            for (var $l5 = 0, $end4 = Segments1.FLength - 1; $l5 <= $end4; $l5++) {
              i = $l5;
              if (Segments1.GetItem(i).IsNear(V2)) {
                NewFace.AddVector(pas.uVector.TVector.$clone(V2),true);
                Found = true;
                V2.$assign(Segments2.GetItem(i));
                Segments1.Delete(i);
                Segments2.Delete(i);
                break;
              };
            };
          } while (Found);
          if (V2.IsNear(V0) && (NewFace.GetVertexCount() > 2)) {
            NewFace.CheckFace();
            if (NewFace.GetVertexCount() > 2) {
              NewPart.FFaces.Add(NewFace);
              if (InvisibleEdges !== 0) this.SetFaceEdgesVisibility(NewPart,NewFace,InvisibleEdges);
            } else NewFace = rtl.freeLoc(NewFace);
          } else NewFace = rtl.freeLoc(NewFace);
        };
      } finally {
        Segments1 = rtl.freeLoc(Segments1);
        Segments2 = rtl.freeLoc(Segments2);
      };
      Result = true;
      return Result;
    };
    this.GetNearestFace = function (Part, Vector) {
      var Result = null;
      var d = 0.0;
      var MinDistance = 0.0;
      var Face = null;
      Result = null;
      MinDistance = 1e10;
      var $in = Part.FFaces.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Face = $in.DoGetCurrent();
          d = Math.abs(Face.GetPlane().DistanceToPoint(Vector));
          if (d < MinDistance) {
            MinDistance = d;
            Result = Face;
          };
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      return Result;
    };
  });
  $mod.$implcode = function () {
    $impl.DELTA = 0.001 / 240;
  };
},["Math","uFaceUtils","uGeometryUtils"]);
rtl.module("uPuzzleUtils",["System","uVector","uPuzzle","uFace","uPlane","uPart","Generics.Collections","Graphics"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TPuzzleUtils",pas.System.TObject,function () {
    this.ListUniqueColors = function (Puzzle, Colors, IgnoreInvisibleEdges) {
      var Color = 0;
      var LastColor = 0;
      var Face = null;
      var Part = null;
      LastColor = -1;
      var $in = Puzzle.FParts.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Part = $in.DoGetCurrent();
          if (Part.FVisible) {
            var $in1 = Part.FFaces.GetEnumerator$1();
            try {
              while ($in1.MoveNext()) {
                Face = $in1.DoGetCurrent();
                Color = Face.Color;
                if (Face.IsColored() && (Color !== LastColor) && (!IgnoreInvisibleEdges || Face.AllEdgesVisible())) {
                  if (!Colors.Contains(Color)) Colors.Add(Color);
                  LastColor = Color;
                };
              }
            } finally {
              $in1 = rtl.freeLoc($in1)
            };
          };
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.RemoveGrayParts = function (Puzzle) {
      function PartIsColored(Part) {
        var Result = false;
        var Face = null;
        Result = true;
        var $in = Part.FFaces.GetEnumerator$1();
        try {
          while ($in.MoveNext()) {
            Face = $in.DoGetCurrent();
            if (Face.Color !== -1) return Result;
          }
        } finally {
          $in = rtl.freeLoc($in)
        };
        Result = false;
        return Result;
      };
      var i = 0;
      var Part = null;
      for (var $l = Puzzle.FParts.FLength - 1; $l >= 0; $l--) {
        i = $l;
        Part = Puzzle.FParts.GetItem(i);
        if (Part.FVisible && !PartIsColored(Part)) {
          Part = rtl.freeLoc(Part);
          Puzzle.FParts.Delete(i);
        };
      };
    };
    this.CutByPlane = function (Puzzle, Plane, Color, InvisibleEdges) {
      var i = 0;
      var hp = 0;
      var NewParts = null;
      var Part = null;
      NewParts = pas["Generics.Collections"].TList$G12.$create("Create$1");
      try {
        for (var $l = Puzzle.FParts.FLength - 1; $l >= 0; $l--) {
          i = $l;
          Part = Puzzle.FParts.GetItem(i);
          if (Part.FVisible) {
            hp = Part.HalfPlane(Plane);
            if (hp === pas.uGeometryUtils.THalfOfPlane.hopIntersect) {
              if (pas.uPartUtils.TPartUtils.CutPart(Part,pas.uPlane.TPlane.$clone(Plane),NewParts,Color,InvisibleEdges)) {
                Part = rtl.freeLoc(Part);
                Puzzle.FParts.Delete(i);
                Puzzle.FParts.InsertRange$2(i,NewParts);
                NewParts.Clear();
              };
            } else if (hp === pas.uGeometryUtils.THalfOfPlane.hopInside) {
              Part = rtl.freeLoc(Part);
              Puzzle.FParts.Delete(i);
            };
          };
        };
        Puzzle.PositionsInvalidate();
      } finally {
        NewParts = rtl.freeLoc(NewParts);
      };
    };
    this.SplitByPlane = function (Puzzle, Plane, Color1, Color2, InvisibleEdges1, InvisibleEdges2) {
      var i = 0;
      var Copy = null;
      var Part = null;
      var OppositePlane = pas.uPlane.TPlane.$new();
      var NewParts = null;
      OppositePlane.$assign(Plane);
      OppositePlane.TurnRound();
      NewParts = pas["Generics.Collections"].TList$G12.$create("Create$1");
      try {
        for (var $l = Puzzle.FParts.FLength - 1; $l >= 0; $l--) {
          i = $l;
          Part = Puzzle.FParts.GetItem(i);
          if (Part.FVisible && (Part.HalfPlane(Plane) === pas.uGeometryUtils.THalfOfPlane.hopIntersect)) {
            Copy = pas.uPart.TPart.$create("Create$1");
            Copy.Assign(Part);
            pas.uPartUtils.TPartUtils.CutPart(Part,pas.uPlane.TPlane.$clone(Plane),NewParts,Color1,InvisibleEdges1);
            Part = rtl.freeLoc(Part);
            Puzzle.FParts.Delete(i);
            Puzzle.FParts.InsertRange$2(i,NewParts);
            NewParts.Clear();
            pas.uPartUtils.TPartUtils.CutPart(Copy,pas.uPlane.TPlane.$clone(OppositePlane),NewParts,Color2,InvisibleEdges2);
            Puzzle.FParts.InsertRange$2(i,NewParts);
            NewParts.Clear();
            Copy = rtl.freeLoc(Copy);
          };
        };
        Puzzle.PositionsInvalidate();
      } finally {
        NewParts = rtl.freeLoc(NewParts);
      };
    };
    this.InvertVisibility = function (Puzzle) {
      var Part = null;
      var $in = Puzzle.FParts.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Part = $in.DoGetCurrent();
          Part.FVisible = !Part.FVisible;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.SetAllInvisible = function (Puzzle) {
      var Part = null;
      var $in = Puzzle.FParts.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Part = $in.DoGetCurrent();
          Part.FVisible = false;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.SetAllVisible = function (Puzzle) {
      var Part = null;
      var $in = Puzzle.FParts.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Part = $in.DoGetCurrent();
          Part.FVisible = true;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.SplitByAxes = function (Puzzle) {
      var i = 0;
      var Axis = null;
      var $in = Puzzle.FAxes.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Axis = $in.DoGetCurrent();
          for (var $l = 0, $end = Axis.Layers.FLength - 2; $l <= $end; $l++) {
            i = $l;
            $mod.TPuzzleUtils.SplitByPlane(Puzzle,pas.uPlane.TPlane.$clone(Axis.GetLayerPlaneTo(i)),-1,-1,0,0);
          };
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.GetVisiblePartContaining = function (Puzzle, Vector) {
      var Result = null;
      var Part = null;
      Result = null;
      var $in = Puzzle.FParts.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Part = $in.DoGetCurrent();
          if (Part.FVisible && Part.Contains(Vector)) return Part;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      return Result;
    };
    this.GetNearestVisibleFace = function (Puzzle, Vector) {
      var Result = null;
      var Part = null;
      Part = $mod.TPuzzleUtils.GetVisiblePartContaining(Puzzle,pas.uVector.TVector.$clone(Vector));
      if (Part !== null) {
        Result = pas.uPartUtils.TPartUtils.GetNearestFace(Part,pas.uVector.TVector.$clone(Vector))}
       else Result = null;
      return Result;
    };
  });
},["uAxis","uPartUtils","uGeometryUtils","SysUtils"]);
rtl.module("Dialogs",["System"],function () {
  "use strict";
  var $mod = this;
  this.ShowMessage = function (Msg) {
  };
});
rtl.module("uSolvedState",["System","Generics.Collections","uVector"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TFaceProperties",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.vc = pas.uVector.TVector.$new();
      this.vn = pas.uVector.TVector.$new();
      this.ColorIndex = 0;
    };
    this.$final = function () {
      this.vc = undefined;
      this.vn = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function () {
      this.ColorIndex = -1;
      return this;
    };
  });
  rtl.createClass(this,"TSolvedState",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FacesProperties = null;
    };
    this.$final = function () {
      this.FacesProperties = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function () {
      this.FacesProperties = pas["Generics.Collections"].TList$G5.$create("Create$1");
      return this;
    };
    this.Destroy = function () {
      var i = 0;
      var FacePropertiesItem = null;
      for (var $l = 0, $end = this.FacesProperties.FLength - 1; $l <= $end; $l++) {
        i = $l;
        FacePropertiesItem = this.FacesProperties.GetItem(i);
        FacePropertiesItem = rtl.freeLoc(FacePropertiesItem);
      };
      rtl.free(this,"FacesProperties");
      pas.System.TObject.Destroy.call(this);
    };
    this.CalcFromPuzzle = function (Puzzle) {
      var $Self = this;
      var FPuzzle = null;
      var v1 = pas.uVector.TVector.$new();
      var v2 = pas.uVector.TVector.$new();
      var v3 = pas.uVector.TVector.$new();
      var Colors = null;
      function AddFace(Face) {
        var i = 0;
        var c1 = 0.0;
        var c2 = 0.0;
        var c3 = 0.0;
        var fp = null;
        fp = $mod.TFaceProperties.$create("Create$1");
        fp.ColorIndex = Colors.IndexOf(Face.Color);
        fp.vc.$assign(Face.GetVertex(0));
        for (var $l = 1, $end = Face.GetVertexCount() - 1; $l <= $end; $l++) {
          i = $l;
          fp.vc.x = fp.vc.x + Face.GetVertex(i).x;
          fp.vc.y = fp.vc.y + Face.GetVertex(i).y;
          fp.vc.z = fp.vc.z + Face.GetVertex(i).z;
        };
        fp.vc.$assign(pas.uVector.VectorDivide(fp.vc,Face.GetVertexCount()));
        c1 = pas.uVector.VectorDot(fp.vc,v1);
        c2 = pas.uVector.VectorDot(fp.vc,v2);
        c3 = pas.uVector.VectorDot(fp.vc,v3);
        fp.vc.x = c1;
        fp.vc.y = c2;
        fp.vc.z = c3;
        fp.vn.$assign(Face.GetNorm());
        c1 = pas.uVector.VectorDot(fp.vn,v1);
        c2 = pas.uVector.VectorDot(fp.vn,v2);
        c3 = pas.uVector.VectorDot(fp.vn,v3);
        fp.vn.x = c1;
        fp.vn.y = c2;
        fp.vn.z = c3;
        $Self.FacesProperties.Add(fp);
      };
      var i = 0;
      var j = 0;
      FPuzzle = Puzzle;
      if (FPuzzle.FAxes.FLength < 2) {
        pas.Dialogs.ShowMessage("TSolvedState.CalcFromPuzzle: Axes.Count < 2");
        return;
      };
      v1.$assign(FPuzzle.FAxes.GetItem(0).GetNormVector());
      v2.$assign(FPuzzle.FAxes.GetItem(1).GetNormVector());
      v2.$assign(pas.uVector.VectorCross(v2,v1));
      if (v2.Abs() < 1e-4) {
        pas.Dialogs.ShowMessage("TSolvedState.CalcFromPuzzle: first and second axes can't be parallel");
        return;
      };
      v2.Normalize();
      v3.$assign(v2);
      v3.$assign(pas.uVector.VectorCross(v3,v1));
      v3.Normalize();
      Colors = pas["Generics.Collections"].TList$G8.$create("Create$1");
      pas.uPuzzleUtils.TPuzzleUtils.ListUniqueColors(FPuzzle,Colors,false);
      for (var $l = 0, $end = FPuzzle.FParts.FLength - 1; $l <= $end; $l++) {
        i = $l;
        for (var $l1 = 0, $end1 = FPuzzle.FParts.GetItem(i).FFaces.FLength - 1; $l1 <= $end1; $l1++) {
          j = $l1;
          if (FPuzzle.FParts.GetItem(i).FFaces.GetItem(j).Color !== -1) AddFace(FPuzzle.FParts.GetItem(i).FFaces.GetItem(j));
        };
      };
      Colors = rtl.freeLoc(Colors);
    };
  });
  rtl.createClass(this,"TSolvedStates",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FSolvedStates = null;
      this.UniquePlanes = 0;
    };
    this.$final = function () {
      this.FSolvedStates = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function () {
      this.FSolvedStates = pas["Generics.Collections"].TList$G6.$create("Create$1");
      return this;
    };
    this.Destroy = function () {
      this.Clear();
      rtl.free(this,"FSolvedStates");
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      var i = 0;
      var SolvedStateItem = null;
      for (var $l = 0, $end = this.FSolvedStates.FLength - 1; $l <= $end; $l++) {
        i = $l;
        SolvedStateItem = this.FSolvedStates.GetItem(i);
        SolvedStateItem = rtl.freeLoc(SolvedStateItem);
      };
      this.FSolvedStates.Clear();
    };
  });
},["uPuzzle","uFace","uPart","uPuzzleUtils","Graphics","Dialogs"]);
rtl.module("uMacro",["System","Generics.Collections","Types","Classes"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TMacro",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.Name = "";
      this.Description = "";
      this.Sequence = "";
    };
  });
});
rtl.module("uSelection",["System","uFace","uPart","uAxis","uVector","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TMovingParts",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FMovingParts = null;
      this.SelectedPart = null;
      this.AxisNo = 0;
      this.TurnWithAxes = false;
      this.Angle = 0.0;
    };
    this.$final = function () {
      this.FMovingParts = undefined;
      this.SelectedPart = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.FMovingParts = pas["Generics.Collections"].TList$G12.$create("Create$1");
      this.Clear();
      return this;
    };
    this.Destroy = function () {
      this.Clear();
      rtl.free(this,"FMovingParts");
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      this.SelectedPart = null;
      this.AxisNo = -1;
      this.TurnWithAxes = false;
      this.Angle = 0;
      this.FMovingParts.Clear();
    };
    this.AddPart = function (Part) {
      if (this.FMovingParts.IndexOf(Part) === -1) this.FMovingParts.Add(Part);
    };
  });
  rtl.createClass(this,"TSelection",pas.System.TObject,function () {
    this.SelectedPart = null;
    this.SelectedFace = null;
    this.MouseOverPart = null;
    this.MouseOverFace = null;
    this.MouseOverAxis = null;
    this.MouseOverAxisNo = 0;
    this.MouseNearestVertex = 0;
    this.OldSelected = null;
    this.TurnAxisNo = 0;
    this.TurnAxis = null;
    this.RotateDirection = 0;
    this.AngleMin = 0.0;
    this.AngleMax = 0.0;
    this.TurnLayers = [];
    this.Clear = function () {
      $mod.TSelection.SelectedPart = null;
      $mod.TSelection.SelectedFace = null;
      $mod.TSelection.MouseOverPart = null;
      $mod.TSelection.MouseOverFace = null;
      $mod.TSelection.MouseOverAxis = null;
      $mod.TSelection.MouseOverAxisNo = -1;
      $mod.TSelection.MouseNearestVertex = -1;
      $mod.TSelection.OldSelected = null;
    };
  });
});
rtl.module("uVectorImage",["System","Classes","Graphics","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TVectorCommand",pas.System.TObject,function () {
  });
  rtl.createClass(this,"TVectorImage",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FVectorCommands = null;
    };
    this.$final = function () {
      this.FVectorCommands = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Destroy = function () {
      this.Clear();
      rtl.free(this,"FVectorCommands");
      pas.System.TObject.Destroy.call(this);
    };
    this.Clear = function () {
      var vc = null;
      var $in = this.FVectorCommands.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          vc = $in.DoGetCurrent();
          vc = rtl.freeLoc(vc);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      this.FVectorCommands.Clear();
    };
  });
},["uUtils","SysUtils"]);
rtl.module("uTexture",["System","uVectorImage","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TTexture",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.Name = "";
      this.FileName = "";
      this.VectorImage = null;
    };
    this.$final = function () {
      this.VectorImage = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.Name = "";
      this.FileName = "";
      this.VectorImage = null;
      return this;
    };
    this.Destroy = function () {
      if (this.VectorImage !== null) rtl.free(this,"VectorImage");
      pas.System.TObject.Destroy.call(this);
    };
  });
},["SysUtils"]);
rtl.module("uPuzzleHeader",["System"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TPuzzleHeader",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.Name = "";
      this.Aliases = "";
      this.ClassString = "";
      this.MenuString = "";
      this.Inventor = "";
      this.Programmer = "";
      this.Added = "";
      this.Link = "";
      this.FileName = "";
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.Clear();
      return this;
    };
    this.Clear = function () {
      this.Name = "";
      this.Aliases = "";
      this.ClassString = "";
      this.MenuString = "";
      this.Inventor = "";
      this.Programmer = "";
      this.Added = "";
      this.Link = "";
      this.FileName = "";
    };
  });
});
rtl.module("uPuzzleBase",["System","uMatrix","uPart","uAxis","uTexture","uPuzzleHeader","uVector","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT(this,"TPartPosition",function () {
    this.iFrom = 0;
    this.iTo = 0;
    this.$eq = function (b) {
      return (this.iFrom === b.iFrom) && (this.iTo === b.iTo);
    };
    this.$assign = function (s) {
      this.iFrom = s.iFrom;
      this.iTo = s.iTo;
      return this;
    };
  });
  rtl.createClass(this,"TPuzzleBase",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FParts = null;
      this.FAxes = null;
      this.FTextures = null;
      this.Header = null;
      this.FPartPositions = [];
      this.FAxesValid = [];
    };
    this.$final = function () {
      this.FParts = undefined;
      this.FAxes = undefined;
      this.FTextures = undefined;
      this.Header = undefined;
      this.FPartPositions = undefined;
      this.FAxesValid = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.TransParts = function (mat, Parts) {
      var Part = null;
      var $in = Parts.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Part = $in.DoGetCurrent();
          Part.Trans(pas.uMatrix.T4x4Matrix$clone(mat));
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.TransAxes = function (mat, Axes) {
      var Axis = null;
      var $in = Axes.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Axis = $in.DoGetCurrent();
          Axis.Trans(pas.uMatrix.T4x4Matrix$clone(mat));
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.Header = pas.uPuzzleHeader.TPuzzleHeader.$create("Create$1");
      this.FAxes = pas["Generics.Collections"].TList$G14.$create("Create$1");
      this.FParts = pas["Generics.Collections"].TList$G12.$create("Create$1");
      this.FTextures = pas["Generics.Collections"].TList$G15.$create("Create$1");
      return this;
    };
    this.Destroy = function () {
      this.Clear();
      rtl.free(this,"FTextures");
      rtl.free(this,"FParts");
      rtl.free(this,"FAxes");
      rtl.free(this,"Header");
      this.FPartPositions = [];
      pas.System.TObject.Destroy.call(this);
    };
    this.ClearHeader = function () {
      this.Header.Clear();
    };
    this.Clear = function () {
      var i = 0;
      var Texture = null;
      var Part = null;
      var Axis = null;
      this.ClearHeader();
      for (var $l = 0, $end = this.FTextures.FLength - 1; $l <= $end; $l++) {
        i = $l;
        Texture = this.FTextures.GetItem(i);
        Texture = rtl.freeLoc(Texture);
      };
      this.FTextures.Clear();
      for (var $l1 = 0, $end1 = this.FParts.FLength - 1; $l1 <= $end1; $l1++) {
        i = $l1;
        Part = this.FParts.GetItem(i);
        Part = rtl.freeLoc(Part);
      };
      this.FParts.Clear();
      for (var $l2 = 0, $end2 = this.FAxes.FLength - 1; $l2 <= $end2; $l2++) {
        i = $l2;
        Axis = this.FAxes.GetItem(i);
        Axis = rtl.freeLoc(Axis);
      };
      this.FAxes.Clear();
    };
    this.Trans = function (mat) {
      this.TransParts(pas.uMatrix.T4x4Matrix$clone(mat),this.FParts);
      this.TransAxes(pas.uMatrix.T4x4Matrix$clone(mat),this.FAxes);
    };
    this.GetPartPosition = function (AxisNo, PartNo, iFrom, iTo) {
      var PartPosition = $mod.TPartPosition.$new();
      this.FAxesValid = rtl.arraySetLength(this.FAxesValid,false,this.FAxes.FLength);
      if (!this.FAxesValid[AxisNo]) this.CalcPartPositionsForAxis(AxisNo);
      PartPosition.$assign(this.FPartPositions[AxisNo][PartNo]);
      iFrom.set(PartPosition.iFrom);
      iTo.set(PartPosition.iTo);
    };
    this.PositionsInvalidate = function () {
      var i = 0;
      var n = 0;
      n = this.FAxes.FLength;
      this.FAxesValid = rtl.arraySetLength(this.FAxesValid,false,n);
      for (var $l = 0, $end = n - 1; $l <= $end; $l++) {
        i = $l;
        this.FAxesValid[i] = false;
      };
    };
    var DELTA = 1e-4;
    this.CalcPartPosition = function (AxisNo, Part, iFrom, iTo) {
      var $Self = this;
      var AMin = 0.0;
      var AMax = 0.0;
      var Axis = null;
      function GetProjectionBoundaries() {
        var Result = false;
        var d = 0.0;
        var BaseProjection = 0.0;
        var NormVect = pas.uVector.TVector.$new();
        var Vector = pas.uVector.TVector.$new();
        Result = false;
        NormVect.$assign(Axis.GetNormVector());
        var $in = Part.FVertices.GetEnumerator$1();
        try {
          while ($in.MoveNext()) {
            Vector = $in.DoGetCurrent();
            d = pas.uVector.VectorDot(Vector,NormVect);
            if (!Result) {
              AMin = d;
              AMax = d;
              Result = true;
            } else {
              if (d < AMin) AMin = d;
              if (d > AMax) AMax = d;
            };
          }
        } finally {
          $in = rtl.freeLoc($in)
        };
        if (Result) {
          BaseProjection = pas.uVector.VectorDot(Axis.GetNormVector(),Axis.GetBaseVector());
          AMin = AMin - BaseProjection;
          AMax = AMax - BaseProjection;
        };
        return Result;
      };
      var i = 0;
      Axis = this.FAxes.GetItem(AxisNo);
      GetProjectionBoundaries();
      iFrom.set(0);
      for (var $l = 1, $end = Axis.Layers.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (Axis.Layers.GetItem(i).DistanceFrom < (AMin + 1E-4)) {
          iFrom.set(i)}
         else break;
      };
      iTo.set(Axis.Layers.FLength - 1);
      for (var $l1 = Axis.Layers.FLength - 2; $l1 >= 0; $l1--) {
        i = $l1;
        if (Axis.Layers.GetItem(i).DistanceTo > (AMax - 1E-4)) {
          iTo.set(i)}
         else break;
      };
    };
    this.CalcPartPositionsForAxis = function (AxisNo) {
      var i = 0;
      var PCount = 0;
      PCount = this.FParts.FLength;
      this.FPartPositions = rtl.arraySetLength(this.FPartPositions,$mod.TPartPosition,this.FAxes.FLength,PCount);
      for (var $l = 0, $end = PCount - 1; $l <= $end; $l++) {
        i = $l;
        var $with = this.FPartPositions[AxisNo][i];
        this.CalcPartPosition(AxisNo,this.FParts.GetItem(i),{p: $with, get: function () {
            return this.p.iFrom;
          }, set: function (v) {
            this.p.iFrom = v;
          }},{p: $with, get: function () {
            return this.p.iTo;
          }, set: function (v) {
            this.p.iTo = v;
          }});
      };
      this.FAxesValid[AxisNo] = true;
    };
  });
});
rtl.module("uTurn",["System","uPart","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  this.TTurningType = {"0": "ttyNone", ttyNone: 0, "1": "ttyLayerTurn", ttyLayerTurn: 1, "2": "ttyPartsMove", ttyPartsMove: 2};
  rtl.createClass(this,"TTurn",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.typ = 0;
      this.AxisNo = 0;
      this.Layers = [];
      this.Angle = 0.0;
      this.Distance = 0.0;
    };
    this.$final = function () {
      this.Layers = undefined;
      pas.System.TObject.$final.call(this);
    };
  });
});
rtl.module("uPuzzle",["System","uSolvedState","uMatrix","uPart","uAxis","uMacro","uSelection","uPuzzleBase","uTurn","Classes","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.TTurningState = {"0": "tsFree", tsFree: 0, "1": "tsMidTurn", tsMidTurn: 1, "2": "tsTurningAnimated", tsTurningAnimated: 2, "3": "tsWholeRotating", tsWholeRotating: 3};
  this.TTurningType = {"0": "ttManual", ttManual: 0, "1": "ttScramble", ttScramble: 1, "2": "ttUndo", ttUndo: 2, "3": "ttRedo", ttRedo: 3, "4": "ttMacro", ttMacro: 4};
  this.TCheckSolvedProc = {"0": "cspEachColorHasSameDirection", cspEachColorHasSameDirection: 0, "1": "cspEachColorHasSameOrOppositeDirection", cspEachColorHasSameOrOppositeDirection: 1, "2": "cspCountUniquePlanes", cspCountUniquePlanes: 2, "3": "cspEachFaceConsistsOfDifferentColors", cspEachFaceConsistsOfDifferentColors: 3, "4": "cspEachRowColDiagConsistsOfDifferentColors", cspEachRowColDiagConsistsOfDifferentColors: 4, "5": "cspCheckSavedStates", cspCheckSavedStates: 5, "6": "cspEachPlaneHasOneColor", cspEachPlaneHasOneColor: 6, "7": "cspEachColorHasSameDirectionOrCountUniquePlanes", cspEachColorHasSameDirectionOrCountUniquePlanes: 7, "8": "cspAdjoiningFacesHaveSameColors", cspAdjoiningFacesHaveSameColors: 8, "9": "cspEachRowColConsistsOfDifferentColors", cspEachRowColConsistsOfDifferentColors: 9};
  rtl.createClass(this,"TPuzzle",pas.uPuzzleBase.TPuzzleBase,function () {
    this.$init = function () {
      pas.uPuzzleBase.TPuzzleBase.$init.call(this);
      this.FCheckSolvedProc = 0;
      this.FMarks = null;
      this.FSolvedStates = null;
      this.FMovingParts = null;
      this.FUndoRecordEnabled = false;
      this.FCheckSliceEnabled = false;
      this.FCheckFixedLayersEnabled = false;
      this.FAnimationEnabled = false;
      this.FOnBeforeTurn = null;
      this.FOnTurning = null;
      this.FOnAfterTurn = null;
      this.FOnTransLayers = null;
      this.Macros = null;
      this.TurningState = 0;
      this.TimerValue = 0;
      this.MovesStartingPoint = 0;
      this.UndoStack = null;
      this.RedoStack = null;
    };
    this.$final = function () {
      this.FMarks = undefined;
      this.FSolvedStates = undefined;
      this.FMovingParts = undefined;
      this.FOnBeforeTurn = undefined;
      this.FOnTurning = undefined;
      this.FOnAfterTurn = undefined;
      this.FOnTransLayers = undefined;
      this.Macros = undefined;
      this.UndoStack = undefined;
      this.RedoStack = undefined;
      pas.uPuzzleBase.TPuzzleBase.$final.call(this);
    };
    this.GetUndoCount = function () {
      var Result = 0;
      Result = this.UndoStack.FLength;
      return Result;
    };
    var delta$2 = 1e-4;
    this.AddUndo = function (AxisNo, Layers, Angle) {
      var Turn = null;
      var i = 0;
      if (Math.abs(Angle) < 1E-4) return;
      Turn = pas.uTurn.TTurn.$create("Create");
      Turn.typ = pas.uTurn.TTurningType.ttyLayerTurn;
      Turn.AxisNo = AxisNo;
      Turn.Layers = rtl.arraySetLength(Turn.Layers,false,rtl.length(Layers));
      for (var $l = 0, $end = rtl.length(Turn.Layers) - 1; $l <= $end; $l++) {
        i = $l;
        Turn.Layers[i] = Layers[i];
      };
      Turn.Angle = Angle;
      this.UndoStack.Add(Turn);
    };
    this.ClearRedoStack = function () {
      var Turn = null;
      var $in = this.RedoStack.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Turn = $in.DoGetCurrent();
          Turn = rtl.freeLoc(Turn);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      this.RedoStack.Clear();
    };
    this.ClearUndoStack = function () {
      var Turn = null;
      var $in = this.UndoStack.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Turn = $in.DoGetCurrent();
          Turn = rtl.freeLoc(Turn);
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
      this.UndoStack.Clear();
    };
    this.GetMovingParts = function (AxisNo, Layers) {
      var Result = false;
      var pFrom = 0;
      var pTo = 0;
      var i = 0;
      var j = 0;
      this.FMovingParts.Clear();
      if (this.FAxes.GetItem(AxisNo).Enabled) {
        this.FMovingParts.AxisNo = AxisNo;
        for (var $l = 0, $end = this.FParts.FLength - 1; $l <= $end; $l++) {
          i = $l;
          this.GetPartPosition(AxisNo,i,{get: function () {
              return pFrom;
            }, set: function (v) {
              pFrom = v;
            }},{get: function () {
              return pTo;
            }, set: function (v) {
              pTo = v;
            }});
          for (var $l1 = pFrom, $end1 = pTo; $l1 <= $end1; $l1++) {
            j = $l1;
            if (Layers[j]) {
              this.FMovingParts.AddPart(this.FParts.GetItem(i));
              continue;
            };
          };
        };
      };
      Result = (this.FMovingParts.FMovingParts.FLength > 0) && (this.FMovingParts.FMovingParts.FLength < this.FParts.FLength);
      return Result;
    };
    this.AddMovingLayer = function (AxisNo, LayerNo, Layers) {
      var i = 0;
      var j = 0;
      var k = 0;
      var Axis = null;
      var iFrom = 0;
      var iTo = 0;
      if (pas.uSelection.TSelection.TurnLayers[LayerNo]) return;
      pas.uSelection.TSelection.TurnLayers[LayerNo] = true;
      Axis = this.FAxes.GetItem(AxisNo);
      if (!Axis.Enabled) return;
      if ((LayerNo < (Axis.Layers.FLength - 1)) && this.IsPlaneBlocked(AxisNo,LayerNo,0)) this.AddMovingLayer(AxisNo,LayerNo + 1,Layers);
      if ((LayerNo > 0) && this.IsPlaneBlocked(AxisNo,LayerNo - 1,0)) this.AddMovingLayer(AxisNo,LayerNo - 1,Layers);
      for (var $l = 0, $end = this.FParts.FLength - 1; $l <= $end; $l++) {
        i = $l;
        this.GetPartPosition(AxisNo,i,{get: function () {
            return iFrom;
          }, set: function (v) {
            iFrom = v;
          }},{get: function () {
            return iTo;
          }, set: function (v) {
            iTo = v;
          }});
        if ((LayerNo >= iFrom) && (LayerNo <= iTo)) for (var $l1 = iFrom, $end1 = iTo; $l1 <= $end1; $l1++) {
          j = $l1;
          this.AddMovingLayer(AxisNo,j,Layers);
        };
      };
      for (var $l2 = 0, $end2 = rtl.length(Axis.ConnectedLayers) - 1; $l2 <= $end2; $l2++) {
        i = $l2;
        for (var $l3 = 0, $end3 = rtl.length(Axis.ConnectedLayers[i]) - 1; $l3 <= $end3; $l3++) {
          j = $l3;
          if (Axis.ConnectedLayers[i][j] === LayerNo) {
            for (var $l4 = 0, $end4 = rtl.length(Axis.ConnectedLayers[i]) - 1; $l4 <= $end4; $l4++) {
              k = $l4;
              this.AddMovingLayer(AxisNo,Axis.ConnectedLayers[i][k],Layers);
            };
            break;
          };
        };
      };
    };
    this.TransSelection = function (mat) {
      if (this.FMovingParts.TurnWithAxes) this.TransAxes(pas.uMatrix.T4x4Matrix$clone(mat),this.FAxes);
      this.TransParts(pas.uMatrix.T4x4Matrix$clone(mat),this.FMovingParts.FMovingParts);
    };
    this.RotateWOCheckWOAnimation = function (AxisNo, Layers, Al) {
      this.GetMovingParts(AxisNo,Layers);
      this.FMovingParts.TurnWithAxes = this.IsTurnWithAxes(AxisNo,Layers);
      this.TransSelection(this.FAxes.GetItem(AxisNo).GetRotateMatrix(Al));
      this.AddAngles(AxisNo,Layers,Al);
    };
    this.IsPlaneBlocked = function (AxisNo, PlaneNo, RotateDirection) {
      var Result = false;
      var iFrom = 0;
      var iTo = 0;
      var i = 0;
      if (!this.FAxes.GetItem(AxisNo).Enabled) return true;
      for (var $l = 0, $end = this.FParts.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (this.FParts.GetItem(i).FVisible) {
          this.GetPartPosition(AxisNo,i,{get: function () {
              return iFrom;
            }, set: function (v) {
              iFrom = v;
            }},{get: function () {
              return iTo;
            }, set: function (v) {
              iTo = v;
            }});
          if ((iFrom < (PlaneNo + 1)) && (iTo > PlaneNo)) return true;
        };
      };
      Result = false;
      return Result;
    };
    this.AddAngles = function (AxisNo, Layers, Angle) {
      var i = 0;
      var Axis = null;
      Axis = this.FAxes.GetItem(AxisNo);
      if (!this.IsTurnWithAxes(AxisNo,Layers)) {
        for (var $l = 0, $end = rtl.length(Layers) - 1; $l <= $end; $l++) {
          i = $l;
          if (Layers[i]) Axis.Layers.GetItem(i).AddAngle(Angle);
        };
      } else for (var $l1 = 0, $end1 = rtl.length(Layers) - 1; $l1 <= $end1; $l1++) {
        i = $l1;
        if (!Layers[i]) Axis.Layers.GetItem(i).AddAngle(-Angle);
      };
    };
    this.IsTurnWithAxes = function (AxisNo, Layers) {
      var Result = false;
      var BaseLayer = 0;
      var BasePartNo = 0;
      var i = 0;
      var hFrom = 0;
      var hTo = 0;
      var Axis = null;
      Axis = this.FAxes.GetItem(AxisNo);
      BaseLayer = Axis.TurnAxesWithLayer;
      BasePartNo = Axis.TurnAxesWithPartNo;
      if ((BaseLayer !== -1) && Layers[BaseLayer]) return true;
      if (BasePartNo !== -1) {
        this.GetPartPosition(AxisNo,BasePartNo,{get: function () {
            return hFrom;
          }, set: function (v) {
            hFrom = v;
          }},{get: function () {
            return hTo;
          }, set: function (v) {
            hTo = v;
          }});
        for (var $l = hFrom, $end = hTo; $l <= $end; $l++) {
          i = $l;
          if (Layers[i]) return true;
        };
      };
      Result = false;
      return Result;
    };
    var delta$1 = 1e-6;
    this.TurnWithAnimation = function (AngleToTurn) {
      var Diff = 0.0;
      if (this.TurningState === $mod.TTurningState.tsTurningAnimated) return;
      this.TurningState = $mod.TTurningState.tsTurningAnimated;
      try {
        while (Math.abs(AngleToTurn) > 1E-6) {
          Diff = Math.sign(AngleToTurn) * 0.05;
          if (Math.abs(AngleToTurn) < Math.abs(Diff)) Diff = AngleToTurn;
          this.TransLayers(this.FAxes.GetItem(pas.uSelection.TSelection.TurnAxisNo).GetRotateMatrix(Diff),pas.uSelection.TSelection.TurnAxisNo,pas.uSelection.TSelection.TurnLayers);
          AngleToTurn = AngleToTurn - Diff;
          this.TurningEvent($mod.TTurningType.ttManual);
          if (this.FOnTurning != null) this.FOnTurning($mod.TTurningType.ttManual,$mod.TTurningState.tsTurningAnimated);
        };
      } finally {
        this.TurningState = $mod.TTurningState.tsFree;
      };
    };
    this.CalcMovingLayers = function (AxisNo, Layers) {
      var Result = false;
      var Axis = null;
      var i = 0;
      Axis = this.FAxes.GetItem(AxisNo);
      if (!Axis.Enabled) return false;
      pas.uSelection.TSelection.TurnLayers = rtl.arraySetLength(pas.uSelection.TSelection.TurnLayers,false,Axis.Layers.FLength);
      for (var $l = 0, $end = rtl.length(pas.uSelection.TSelection.TurnLayers) - 1; $l <= $end; $l++) {
        i = $l;
        pas.uSelection.TSelection.TurnLayers[i] = false;
      };
      for (var $l1 = 0, $end1 = rtl.length(Layers) - 1; $l1 <= $end1; $l1++) {
        i = $l1;
        if (Layers[i]) this.AddMovingLayer(AxisNo,i,{p: pas.uSelection.TSelection.TSelection, get: function () {
            return this.p.TurnLayers;
          }, set: function (v) {
            this.p.TurnLayers = v;
          }});
      };
      Result = !this.IsTurningWhole(pas.uSelection.TSelection.TurnLayers);
      return Result;
    };
    this.CalcMovingLayers$1 = function (AxisNo, LayerNo, LayersCount) {
      var Result = false;
      var Axis = null;
      var i = 0;
      Axis = this.FAxes.GetItem(AxisNo);
      if (!Axis.Enabled) return false;
      pas.uSelection.TSelection.TurnLayers = rtl.arraySetLength(pas.uSelection.TSelection.TurnLayers,false,Axis.Layers.FLength);
      for (var $l = 0, $end = rtl.length(pas.uSelection.TSelection.TurnLayers) - 1; $l <= $end; $l++) {
        i = $l;
        pas.uSelection.TSelection.TurnLayers[i] = false;
      };
      for (var $l1 = 0, $end1 = LayersCount - 1; $l1 <= $end1; $l1++) {
        i = $l1;
        this.AddMovingLayer(AxisNo,LayerNo + i,{p: pas.uSelection.TSelection.TSelection, get: function () {
            return this.p.TurnLayers;
          }, set: function (v) {
            this.p.TurnLayers = v;
          }});
      };
      Result = !this.IsTurningWhole(pas.uSelection.TSelection.TurnLayers);
      return Result;
    };
    var PI2 = 2 * Math.PI;
    this.GetTurningAngle = function (AxisNo, Layers, Al, AngleMin, AngleMax) {
      var $Self = this;
      var Result = 0.0;
      var Axis = null;
      var iFirst = 0;
      function AngleValid(Angle) {
        var Result = false;
        var i = 0;
        var Layer = null;
        Result = false;
        if ((Al < (AngleMin - 1E-5)) || (Al > (AngleMax + 1E-5))) return Result;
        for (var $l = iFirst, $end = rtl.length(Layers) - 1; $l <= $end; $l++) {
          i = $l;
          if (Layers[i]) {
            Layer = Axis.Layers.GetItem(i);
            if (!Layer.IsValidAngle(Angle + Layer.Angle)) return Result;
          };
        };
        Result = true;
        return Result;
      };
      var i = 0;
      var FirstLayer = null;
      var A = 0.0;
      var AnglePlus = 0.0;
      var AngleMinus = 0.0;
      var PlusValid = false;
      var MinusValid = false;
      var TurnWithAxes = false;
      TurnWithAxes = this.IsTurnWithAxes(AxisNo,Layers);
      if (TurnWithAxes) {
        Al = -Al;
        A = AngleMin;
        AngleMin = -AngleMax;
        AngleMax = -A;
        for (var $l = 0, $end = rtl.length(Layers) - 1; $l <= $end; $l++) {
          i = $l;
          Layers[i] = !Layers[i];
        };
      };
      Axis = this.FAxes.GetItem(AxisNo);
      AnglePlus = Al;
      AngleMinus = Al;
      FirstLayer = null;
      for (var $l1 = 0, $end1 = rtl.length(Layers) - 1; $l1 <= $end1; $l1++) {
        i = $l1;
        if (Layers[i]) {
          iFirst = i;
          FirstLayer = Axis.Layers.GetItem(i);
          break;
        };
      };
      if (FirstLayer === null) {
        Result = 0;
        return Result;
      };
      PlusValid = false;
      while (!PlusValid) {
        AnglePlus = FirstLayer.GetNextAngle(FirstLayer.Angle + AnglePlus) - FirstLayer.Angle;
        if ((AnglePlus > PI2) || (AnglePlus > (AngleMax + 1E-3))) break;
        PlusValid = AngleValid(AnglePlus);
        if (!PlusValid) AnglePlus = AnglePlus + 0.01;
      };
      MinusValid = false;
      while (!MinusValid) {
        AngleMinus = FirstLayer.GetPrevAngle(FirstLayer.Angle + AngleMinus) - FirstLayer.Angle;
        if ((AngleMinus < -PI2) || (AngleMinus < (AngleMin - 1E-3))) break;
        MinusValid = AngleValid(AngleMinus);
        if (!MinusValid) AngleMinus = AngleMinus - 0.01;
      };
      if (PlusValid && MinusValid) {
        if ((AnglePlus - Al) < (Al - AngleMinus)) {
          Result = AnglePlus}
         else Result = AngleMinus;
      } else if (PlusValid) {
        Result = AnglePlus}
       else if (MinusValid) {
        Result = AngleMinus}
       else Result = 0;
      if (TurnWithAxes) Result = -Result;
      return Result;
    };
    this.TransLayers = function (mat, AxisNo, Layers) {
      this.GetMovingParts(AxisNo,Layers);
      this.FMovingParts.TurnWithAxes = this.IsTurnWithAxes(AxisNo,Layers);
      this.TransSelection(pas.uMatrix.T4x4Matrix$clone(mat));
      if (this.FOnTransLayers != null) this.FOnTransLayers(pas.uMatrix.T4x4Matrix$clone(mat),AxisNo,Layers);
    };
    this.IsTurningWhole = function (Layers) {
      var Result = false;
      var i = 0;
      Result = false;
      for (var $l = 0, $end = rtl.length(Layers) - 1; $l <= $end; $l++) {
        i = $l;
        if (!Layers[i]) return Result;
      };
      Result = true;
      return Result;
    };
    this.GetRotateAngleRange = function (AxisNo, Layers, AngleMin, AngleMax) {
      var Axis = null;
      var i = 0;
      var Layer = null;
      AngleMin.set(-1000000);
      AngleMax.set(1000000);
      if (this.IsTurningWhole(Layers)) return;
      Axis = this.FAxes.GetItem(AxisNo);
      if (!Axis.Enabled) return;
      if (!this.IsTurnWithAxes(AxisNo,Layers)) {
        for (var $l = 0, $end = rtl.length(Layers) - 1; $l <= $end; $l++) {
          i = $l;
          if (Layers[i]) {
            Layer = Axis.Layers.GetItem(i);
            AngleMin.set(Math.max(AngleMin.get(),Layer.MinAngle - Layer.Angle));
            AngleMax.set(Math.min(AngleMax.get(),Layer.MaxAngle - Layer.Angle));
          };
        };
      } else {
        for (var $l1 = 0, $end1 = rtl.length(Layers) - 1; $l1 <= $end1; $l1++) {
          i = $l1;
          if (!Layers[i]) {
            Layer = Axis.Layers.GetItem(i);
            AngleMin.set(Math.max(AngleMin.get(),-(Layer.MaxAngle - Layer.Angle)));
            AngleMax.set(Math.min(AngleMax.get(),-(Layer.MinAngle - Layer.Angle)));
          };
        };
      };
    };
    this.Create$1 = function () {
      pas.uPuzzleBase.TPuzzleBase.Create$1.call(this);
      this.FSolvedStates = pas.uSolvedState.TSolvedStates.$create("Create$1");
      this.UndoStack = pas["Generics.Collections"].TList$G17.$create("Create$1");
      this.RedoStack = pas["Generics.Collections"].TList$G17.$create("Create$1");
      this.FMarks = pas["Generics.Collections"].TList$G8.$create("Create$1");
      this.FMovingParts = pas.uSelection.TMovingParts.$create("Create$1");
      this.Macros = pas["Generics.Collections"].TList$G16.$create("Create$1");
      pas.uSelection.TSelection.Clear();
      this.FUndoRecordEnabled = true;
      this.FCheckSliceEnabled = true;
      this.FCheckFixedLayersEnabled = true;
      this.FAnimationEnabled = true;
      return this;
    };
    this.Destroy = function () {
      this.Clear$1();
      rtl.free(this,"Macros");
      rtl.free(this,"FMovingParts");
      rtl.free(this,"FMarks");
      rtl.free(this,"RedoStack");
      rtl.free(this,"UndoStack");
      rtl.free(this,"FSolvedStates");
      pas.uPuzzleBase.TPuzzleBase.Destroy.call(this);
    };
    this.Clear$1 = function () {
      var i = 0;
      var Macro = null;
      pas.uPuzzleBase.TPuzzleBase.Clear.call(this);
      this.TimerValue = 0;
      this.MovesStartingPoint = 0;
      for (var $l = 0, $end = this.Macros.FLength - 1; $l <= $end; $l++) {
        i = $l;
        Macro = this.Macros.GetItem(i);
        Macro = rtl.freeLoc(Macro);
      };
      this.Macros.Clear();
      this.FMovingParts.Clear();
      this.FMarks.Clear();
      this.ClearUndoStack();
      this.ClearRedoStack();
      this.FSolvedStates.Clear();
    };
    this.ClearHeader = function () {
      pas.uPuzzleBase.TPuzzleBase.ClearHeader.call(this);
      this.TurningState = $mod.TTurningState.tsFree;
      this.FCheckSolvedProc = $mod.TCheckSolvedProc.cspEachColorHasSameDirection;
    };
    this.IsTurning = function () {
      var Result = false;
      Result = this.TurningState in rtl.createSet($mod.TTurningState.tsMidTurn,$mod.TTurningState.tsTurningAnimated);
      return Result;
    };
    this.Undo = function (WithAnimation) {
      var Result = false;
      var Turn = null;
      var Angle = 0.0;
      var i = 0;
      Result = false;
      if (this.IsTurning() || (this.TurningState === $mod.TTurningState.tsTurningAnimated)) return Result;
      if (this.UndoStack.FLength === 0) return Result;
      Turn = this.UndoStack.GetItem(this.UndoStack.FLength - 1);
      pas.uSelection.TSelection.TurnAxisNo = Turn.AxisNo;
      pas.uSelection.TSelection.TurnAxis = this.FAxes.GetItem(pas.uSelection.TSelection.TurnAxisNo);
      pas.uSelection.TSelection.TurnLayers = rtl.arraySetLength(pas.uSelection.TSelection.TurnLayers,false,pas.uSelection.TSelection.TurnAxis.Layers.FLength);
      for (var $l = 0, $end = rtl.length(Turn.Layers) - 1; $l <= $end; $l++) {
        i = $l;
        pas.uSelection.TSelection.TurnLayers[i] = Turn.Layers[i];
      };
      Angle = Turn.Angle;
      this.BeforeTurnEvent($mod.TTurningType.ttUndo,pas.uSelection.TSelection.TurnAxisNo,{p: pas.uSelection.TSelection.TSelection, get: function () {
          return this.p.TurnLayers;
        }, set: function (v) {
          this.p.TurnLayers = v;
        }},{p: pas.uSelection.TSelection.TSelection, get: function () {
          return this.p.AngleMin;
        }, set: function (v) {
          this.p.AngleMin = v;
        }},{p: pas.uSelection.TSelection.TSelection, get: function () {
          return this.p.AngleMax;
        }, set: function (v) {
          this.p.AngleMax = v;
        }},pas.uSelection.TSelection.RotateDirection);
      if (this.FOnBeforeTurn != null) this.FOnBeforeTurn($mod.TTurningType.ttUndo,$mod.TTurningState.tsFree);
      if (!WithAnimation) {
        this.GetMovingParts(pas.uSelection.TSelection.TurnAxisNo,pas.uSelection.TSelection.TurnLayers);
        this.FMovingParts.TurnWithAxes = this.IsTurnWithAxes(pas.uSelection.TSelection.TurnAxisNo,pas.uSelection.TSelection.TurnLayers);
        this.TransSelection(this.FAxes.GetItem(pas.uSelection.TSelection.TurnAxisNo).GetRotateMatrix(-Angle));
      } else {
        this.TurnWithAnimation(pas.uUtils.TUtils.PrivPi(-Angle));
        this.TurningState = $mod.TTurningState.tsFree;
      };
      this.RedoStack.Add(Turn);
      this.UndoStack.Delete(this.UndoStack.FLength - 1);
      this.AddAngles(pas.uSelection.TSelection.TurnAxisNo,pas.uSelection.TSelection.TurnLayers,-Angle);
      this.AfterTurnEvent($mod.TTurningType.ttUndo);
      Result = true;
      return Result;
    };
    this.Redo = function (WithAnimation) {
      var Result = false;
      var Turn = null;
      var Angle = 0.0;
      var i = 0;
      Result = false;
      if (this.IsTurning() || (this.TurningState === $mod.TTurningState.tsTurningAnimated)) return Result;
      if (this.RedoStack.FLength === 0) return Result;
      Turn = this.RedoStack.GetItem(this.RedoStack.FLength - 1);
      pas.uSelection.TSelection.TurnAxisNo = Turn.AxisNo;
      if (pas.uSelection.TSelection.TurnAxisNo === -1) return Result;
      pas.uSelection.TSelection.TurnAxis = this.FAxes.GetItem(pas.uSelection.TSelection.TurnAxisNo);
      pas.uSelection.TSelection.TurnLayers = rtl.arraySetLength(pas.uSelection.TSelection.TurnLayers,false,pas.uSelection.TSelection.TurnAxis.Layers.FLength);
      for (var $l = 0, $end = rtl.length(pas.uSelection.TSelection.TurnLayers) - 1; $l <= $end; $l++) {
        i = $l;
        pas.uSelection.TSelection.TurnLayers[i] = Turn.Layers[i];
      };
      Angle = Turn.Angle;
      this.BeforeTurnEvent($mod.TTurningType.ttRedo,pas.uSelection.TSelection.TurnAxisNo,{p: pas.uSelection.TSelection.TSelection, get: function () {
          return this.p.TurnLayers;
        }, set: function (v) {
          this.p.TurnLayers = v;
        }},{p: pas.uSelection.TSelection.TSelection, get: function () {
          return this.p.AngleMin;
        }, set: function (v) {
          this.p.AngleMin = v;
        }},{p: pas.uSelection.TSelection.TSelection, get: function () {
          return this.p.AngleMax;
        }, set: function (v) {
          this.p.AngleMax = v;
        }},pas.uSelection.TSelection.RotateDirection);
      if (this.FOnBeforeTurn != null) this.FOnBeforeTurn($mod.TTurningType.ttRedo,$mod.TTurningState.tsFree);
      if (!WithAnimation) {
        this.GetMovingParts(pas.uSelection.TSelection.TurnAxisNo,pas.uSelection.TSelection.TurnLayers);
        this.FMovingParts.TurnWithAxes = this.IsTurnWithAxes(pas.uSelection.TSelection.TurnAxisNo,pas.uSelection.TSelection.TurnLayers);
        this.TransSelection(this.FAxes.GetItem(pas.uSelection.TSelection.TurnAxisNo).GetRotateMatrix(Angle));
      } else {
        this.TurnWithAnimation(pas.uUtils.TUtils.PrivPi(Angle));
        this.TurningState = $mod.TTurningState.tsFree;
      };
      this.UndoStack.Add(Turn);
      this.RedoStack.Delete(this.RedoStack.FLength - 1);
      this.AddAngles(pas.uSelection.TSelection.TurnAxisNo,pas.uSelection.TSelection.TurnLayers,Angle);
      this.AfterTurnEvent($mod.TTurningType.ttRedo);
      Result = true;
      return Result;
    };
    this.RotateLayer = function (AxisNo, LayerNo, Al, AllowWhole) {
      var Layers = [];
      var i = 0;
      Layers = rtl.arraySetLength(Layers,false,this.FAxes.GetItem(AxisNo).Layers.FLength);
      for (var $l = 0, $end = this.FAxes.GetItem(AxisNo).Layers.FLength - 1; $l <= $end; $l++) {
        i = $l;
        Layers[i] = false;
      };
      Layers[LayerNo] = true;
      this.RotateLayers(AxisNo,Layers,Al,AllowWhole);
    };
    this.RotateLayers = function (AxisNo, Layers, Al, AllowWhole) {
      if (this.FCheckSliceEnabled) if (!this.GetMovingParts(AxisNo,Layers)) if (!AllowWhole) return;
      if (this.FCheckFixedLayersEnabled) if (this.FAxes.GetItem(AxisNo).IsLayerFixed(Layers)) return;
      this.RotateWOCheckWOAnimation(AxisNo,Layers,Al);
      if (this.FUndoRecordEnabled) this.AddUndo(AxisNo,Layers,Al);
      this.ClearRedoStack();
    };
    this.MacroRotateLayers = function (AxisNo, Layers, Al) {
      var Axis = null;
      var AngleMin = 0.0;
      var AngleMax = 0.0;
      var mat = rtl.arraySetLength(null,0.0,4,4);
      this.GetRotateAngleRange(AxisNo,Layers,{get: function () {
          return AngleMin;
        }, set: function (v) {
          AngleMin = v;
        }},{get: function () {
          return AngleMax;
        }, set: function (v) {
          AngleMax = v;
        }});
      this.BeforeTurnEvent($mod.TTurningType.ttMacro,AxisNo,{get: function () {
          return Layers;
        }, set: function (v) {
          Layers = v;
        }},{get: function () {
          return AngleMin;
        }, set: function (v) {
          AngleMin = v;
        }},{get: function () {
          return AngleMax;
        }, set: function (v) {
          AngleMax = v;
        }},Math.sign(Al));
      if (this.FOnBeforeTurn != null) this.FOnBeforeTurn($mod.TTurningType.ttMacro,$mod.TTurningState.tsFree);
      Axis = this.FAxes.GetItem(AxisNo);
      if (Axis.IsLayerFixed(Layers)) return;
      this.GetRotateAngleRange(AxisNo,Layers,{get: function () {
          return AngleMin;
        }, set: function (v) {
          AngleMin = v;
        }},{get: function () {
          return AngleMax;
        }, set: function (v) {
          AngleMax = v;
        }});
      Al = this.GetTurningAngle(AxisNo,Layers,Al,AngleMin,AngleMax);
      mat = Axis.GetRotateMatrix(Al);
      this.GetMovingParts(AxisNo,Layers);
      if (this.IsTurnWithAxes(AxisNo,Layers)) this.TransAxes(pas.uMatrix.T4x4Matrix$clone(mat),this.FAxes);
      this.TransParts(pas.uMatrix.T4x4Matrix$clone(mat),this.FMovingParts.FMovingParts);
      if (this.FOnTransLayers != null) this.FOnTransLayers(pas.uMatrix.T4x4Matrix$clone(mat),AxisNo,Layers);
      this.AddAngles(AxisNo,Layers,Al);
      if (this.FUndoRecordEnabled) this.AddUndo(AxisNo,Layers,Al);
      this.ClearRedoStack();
      this.AfterTurnEvent($mod.TTurningType.ttMacro);
      if (this.FOnAfterTurn != null) this.FOnAfterTurn($mod.TTurningType.ttMacro,$mod.TTurningState.tsFree);
    };
    this.BeforeTurnEvent = function (AType, AxisNo, Layers, AngleMin, AngleMax, RotateDirection) {
    };
    this.TurningEvent = function (AType) {
    };
    this.AfterTurnEvent = function (AType) {
      this.PositionsInvalidate();
    };
    this.BeforeLoadFromXmlEvent = function (XmlNode) {
    };
    this.AfterLoadFromXmlEvent = function (XmlNode) {
    };
    this.DisableAnimation = function () {
      this.FAnimationEnabled = false;
    };
  });
  $mod.$implcode = function () {
    $impl.DELTA = 1e-3;
    $impl.DELTA_ANGLE = 1e-5;
  };
  $mod.$init = function () {
  };
},["uUtils","uLayer","Math","SysUtils"]);
rtl.module("Variants",["System","JS"],function () {
  "use strict";
  var $mod = this;
  this.varEmpty = 0;
  this.varNull = 1;
  this.varDouble = 5;
  this.varBoolean = 11;
  this.varVariant = 12;
  this.varString = 256;
  this.VarType = function (Value) {
    var Result = 0;
    if (pas.JS.isUndefined(Value)) return 0;
    if (pas.JS.isNull(Value)) return 1;
    if (rtl.isNumber(Value)) return 5;
    if (pas.JS.isBoolean(Value)) return 11;
    if (rtl.isString(Value)) return 256;
    Result = 12;
    return Result;
  };
});
rtl.module("uScript",["System","Classes","Generics.Collections","Variants","JS"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT(this,"TVar",function () {
    this.$eq = function (b) {
      return true;
    };
    this.$assign = function (s) {
      return this;
    };
  });
  rtl.createClass(this,"TScript",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.Stop = false;
      this.ErrCode = 0;
      this.ErrMsg = "";
      this.ErrLine = "";
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.Stop = false;
      this.ErrCode = 0;
      this.ErrMsg = "";
      this.ErrLine = "";
      return this;
    };
    this.Destroy = function () {
      pas.System.TObject.Destroy.call(this);
    };
    this.VarByName = function (N, V) {
      var Result = false;
      Result = false;
      return Result;
    };
  });
  this.Calc = null;
  this.ExecuteScript = function (Text) {
  };
  this.CalcExpression = function (Text, Default) {
    var Result = 0.0;
    Result = Default;
    if (Text === "") return Result;
    if (pas.SysUtils.TryStrToFloat(pas.SysUtils.Trim(Text),{get: function () {
        return Result;
      }, set: function (v) {
        Result = v;
      }})) return Result;
    return Result;
    return Result;
  };
  $mod.$init = function () {
    $mod.Calc = $mod.TScript.$create("Create$1");
  };
},["uUtils","SysUtils","Types","Math","Dialogs"]);
rtl.module("uXmlUtils",["System","uVector","Classes","Graphics","DOM","Variants"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.DomValueToString = function (S) {
    var Result = "";
    if (pas.Variants.VarType(S) in rtl.createSet(1,0)) {
      Result = "";
      return Result;
    };
    Result = pas.JS.ToString(S);
    return Result;
  };
  this.GetNodeText = function (XmlNode) {
    var Result = "";
    var TextNode = null;
    Result = "";
    if (XmlNode === null) return Result;
    TextNode = XmlNode.FindNode("#text");
    if (TextNode != null) {
      Result = pas.SysUtils.Trim($mod.DomValueToString(TextNode.GetNodeValue()))}
     else Result = "";
    return Result;
  };
  this.ReadStringFromXml = function (XmlNode, AttrName, Str, Default) {
    if (!$mod.ReadStringFromXml$1(XmlNode,AttrName,Str)) Str.set(Default);
  };
  this.ReadStringFromXml$1 = function (XmlNode, AttrName, Str) {
    var Result = false;
    Str.set("");
    if (XmlNode === null) return false;
    if (AttrName === "") {
      Str.set($mod.DomValueToString($mod.GetNodeText(XmlNode)));
      return Str.get() !== "";
    };
    Str.set(XmlNode.GetAttribute(AttrName));
    if (Str.get() !== "") return true;
    XmlNode = XmlNode.FindNode(AttrName);
    if (XmlNode === null) return false;
    Str.set($mod.DomValueToString(XmlNode.GetTextContent()));
    Result = Str.get() !== "";
    return Result;
  };
  this.ReadStringFromXml$2 = function (XmlNode, AttrName) {
    var Result = "";
    var Str = "";
    Result = "";
    if ($mod.ReadStringFromXml$1(XmlNode,AttrName,{get: function () {
        return Str;
      }, set: function (v) {
        Str = v;
      }})) Result = Str;
    return Result;
  };
  this.ReadStringFromXmlOrParent = function (XmlNode, AttrName) {
    var Result = "";
    var Str = "";
    Result = "";
    if ($impl.ReadStringFromXmlOrParent$1(XmlNode,AttrName,{get: function () {
        return Str;
      }, set: function (v) {
        Str = v;
      }})) Result = Str;
    return Result;
  };
  this.ReadMultiStringFromXml = function (XmlNode, AttrName, Delimiter) {
    var Result = "";
    var i = 0;
    var XmlSubNode = null;
    var S = "";
    Result = "";
    for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
      i = $l;
      XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
      if (pas.SysUtils.SameText(XmlSubNode.GetNodeName(),AttrName)) {
        $mod.ReadStringFromXml(XmlSubNode,"",{get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},"");
        if (S !== "") {
          if (Result !== "") Result = Result + Delimiter;
          Result = Result + S;
        };
      };
    };
    return Result;
  };
  this.GetAttrFromXml = function (XmlNode, AttrName, Default) {
    var Result = "";
    Result = Default;
    if (XmlNode === null) return Result;
    Result = XmlNode.GetAttribute(AttrName);
    if (Result === "") Result = Default;
    return Result;
  };
  this.ReadIntExpressionFromXml = function (XmlNode, AttrName, Default) {
    var Result = 0;
    var Expression = "";
    if ($mod.ReadStringFromXml$1(XmlNode,AttrName,{get: function () {
        return Expression;
      }, set: function (v) {
        Expression = v;
      }})) if (Expression !== "") return Math.round(pas.uScript.CalcExpression(Expression,Default));
    Result = Default;
    return Result;
  };
  this.ReadIntExpressionFromXmlOrParent = function (XmlNode, AttrName, Default) {
    var Result = 0;
    var Expression = "";
    if ($impl.ReadStringFromXmlOrParent$1(XmlNode,AttrName,{get: function () {
        return Expression;
      }, set: function (v) {
        Expression = v;
      }})) if (Expression !== "") return Math.round(pas.uScript.CalcExpression(Expression,Default));
    Result = Default;
    return Result;
  };
  this.ReadDoubleExpressionFromXml = function (XmlNode, AttrName) {
    var Result = 0.0;
    Result = pas.uScript.CalcExpression($mod.ReadStringFromXml$2(XmlNode,AttrName),0);
    return Result;
  };
  this.ReadColorExpressionFromXml = function (XmlNode, AttrName, Default) {
    var Result = 0;
    function StrIsColor(S) {
      var Result = false;
      var i = 0;
      Result = false;
      if (S.length !== 6) return Result;
      for (i = 1; i <= 6; i++) if (!(((S.charAt(i - 1) >= "0") && (S.charAt(i - 1) <= "9")) || ((S.charAt(i - 1) >= "a") && (S.charAt(i - 1) <= "f")) || ((S.charAt(i - 1) >= "A") && (S.charAt(i - 1) <= "F")))) return Result;
      Result = true;
      return Result;
    };
    var Text = "";
    Result = Default;
    Text = pas.SysUtils.Trim($mod.ReadStringFromXml$2(XmlNode,AttrName));
    if (Text === "") return Result;
    if (!StrIsColor(Text)) {
      Text = "";
    };
    Result = pas.uUtils.TUtils.StrToColor(Text);
    return Result;
  };
  this.ReadVectorFromXml = function (Vec, XmlNode, AttrName) {
    var Result = false;
    var S = "";
    if (XmlNode === null) return false;
    S = $mod.GetAttrFromXml(XmlNode,AttrName,"");
    if (S !== "") {
      Vec.x = pas.uScript.CalcExpression(pas.SysUtils.Trim(pas.uUtils.TUtils.Parse({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},";")),0);
      Vec.y = pas.uScript.CalcExpression(pas.SysUtils.Trim(pas.uUtils.TUtils.Parse({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},";")),0);
      Vec.z = pas.uScript.CalcExpression(pas.SysUtils.Trim(pas.uUtils.TUtils.Parse({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},";")),0);
      Result = true;
    } else {
      Vec.x = $mod.ReadDoubleExpressionFromXml(XmlNode,"X");
      Vec.y = $mod.ReadDoubleExpressionFromXml(XmlNode,"Y");
      Vec.z = $mod.ReadDoubleExpressionFromXml(XmlNode,"Z");
      Result = true;
    };
    return Result;
  };
  $mod.$implcode = function () {
    $impl.ReadStringFromXmlOrParent$1 = function (XmlNode, AttrName, Str) {
      var Result = false;
      if (XmlNode === null) return false;
      Result = $mod.ReadStringFromXml$1(XmlNode,AttrName,Str);
      if (!Result && (XmlNode.GetParentNode() !== null)) Result = $mod.ReadStringFromXml$1(XmlNode.GetParentNode(),AttrName,Str);
      return Result;
    };
  };
  $mod.$init = function () {
  };
},["uScript","uUtils","JS","SysUtils"]);
rtl.module("strutils",["System","SysUtils","Types"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.Soundex = function (AText, ALength) {
    var Result = "";
    var S = "";
    var PS = "";
    var I = 0;
    var L = 0;
    Result = "";
    PS = "\x00";
    if (AText.length > 0) {
      Result = pas.System.upcase(AText.charAt(0));
      I = 2;
      L = AText.length;
      while ((I <= L) && (Result.length < ALength)) {
        S = $impl.SScore.charAt(AText.charCodeAt(I - 1) - 1);
        if (!(S.charCodeAt() in rtl.createSet(48,105,PS.charCodeAt()))) Result = Result + S;
        if (S !== "i") PS = S;
        I += 1;
      };
    };
    L = Result.length;
    if (L < ALength) Result = Result + pas.System.StringOfChar("0",ALength - L);
    return Result;
  };
  this.SoundexSimilar = function (AText, AOther, ALength) {
    var Result = false;
    Result = $mod.Soundex(AText,ALength) === $mod.Soundex(AOther,ALength);
    return Result;
  };
  this.SoundexSimilar$1 = function (AText, AOther) {
    var Result = false;
    Result = $mod.SoundexSimilar(AText,AOther,4);
    return Result;
  };
  this.SoundexProc = function (AText, AOther) {
    var Result = false;
    Result = $mod.SoundexSimilar$1(AText,AOther);
    return Result;
  };
  this.AnsiResemblesProc = null;
  this.ResemblesProc = null;
  this.SplitString = function (S, Delimiters) {
    var Result = [];
    Result = pas.SysUtils.TStringHelper.Split.call({get: function () {
        return S;
      }, set: function (v) {
        rtl.raiseE("EPropReadOnly");
      }},Delimiters);
    return Result;
  };
  $mod.$implcode = function () {
    $impl.SScore = "00000000000000000000000000000000" + "00000000000000000000000000000000" + "0123012i02245501262301i2i2" + "000000" + "0123012i02245501262301i2i2" + "00000000000000000000000000000000" + "00000000000000000000000000000000" + "00000000000000000000000000000000" + "00000000000000000000000000000000" + "00000";
  };
  $mod.$init = function () {
    $mod.AnsiResemblesProc = $mod.SoundexProc;
    $mod.ResemblesProc = $mod.SoundexProc;
  };
},["JS"]);
rtl.module("uXmlReadWrite",["System","Types","uPuzzle","uVector","uPlane","uLine","uLayer","uAxis","uFace","uPart","uMacro","uTexture","uTurn","DOM","Graphics","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.XML_VERSION = 2;
  rtl.createClass(this,"TXmlReadWrite",pas.System.TObject,function () {
    this.lMacros = null;
    this.FindMacros = function (XmlNode, MacroNodes, RepeatN) {
      var Result = false;
      var i = 0;
      var MacroName = "";
      var MacroNames = "";
      var AttrName = "";
      var MacroNode = null;
      var lNames = [];
      MacroNames = $impl.XmlTrim(XmlNode.GetAttribute("MacroName"));
      RepeatN.set(pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Repeat",1));
      for (var $l = 0, $end = XmlNode.GetAttributes().Length() - 1; $l <= $end; $l++) {
        i = $l;
        AttrName = XmlNode.GetAttributes().GetItem(i).GetNodeName();
        if ((AttrName !== "MacroName") && (AttrName !== "Repeat")) pas.uScript.ExecuteScript(AttrName + ":=" + XmlNode.GetAttribute(AttrName));
      };
      lNames = pas.strutils.SplitString(MacroNames," ");
      for (var $in = lNames, $l1 = 0, $end1 = rtl.length($in) - 1; $l1 <= $end1; $l1++) {
        MacroName = $in[$l1];
        if (MacroName.length > 0) for (var $l2 = this.lMacros.FLength - 1; $l2 >= 0; $l2--) {
          i = $l2;
          MacroNode = this.lMacros.GetItem(i);
          if ($impl.XmlSameText(MacroName,$impl.XmlTrim(MacroNode.GetAttribute("Name")))) {
            MacroNodes.get().Add(MacroNode);
            break;
          };
        };
      };
      Result = MacroNodes.get().FLength > 0;
      return Result;
    };
    this.AddCylinder = function (Part, Base, Top, Radius, Color, BaseColor, TopColor) {
      var i = 0;
      var x = rtl.arraySetLength(null,0.0,64);
      var y = rtl.arraySetLength(null,0.0,64);
      var dA = 0.0;
      var Al = 0.0;
      var Height = 0.0;
      var V = pas.uVector.TVector.$new();
      var a = pas.uVector.TVector.$new();
      var Vec = pas.uVector.TVector.$new();
      var FaceTop = null;
      var FaceBottom = null;
      var FaceSide = null;
      dA = (2 * Math.PI) / 64;
      Al = 0;
      for (i = 0; i <= 63; i++) {
        x[i] = Math.cos(Al);
        y[i] = Math.sin(Al);
        Al = Al + dA;
      };
      FaceBottom = pas.uFace.TFace.$create("Create$1",[Part.FVertices]);
      FaceBottom.Color = BaseColor;
      FaceTop = pas.uFace.TFace.$create("Create$1",[Part.FVertices]);
      FaceTop.Color = TopColor;
      for (i = 0; i <= 63; i++) {
        Vec.$assign(pas.uVector.Vector(x[i],y[i],0));
        Part.FVertices.Add(Vec);
        FaceBottom.AddVector(pas.uVector.TVector.$clone(Vec),true);
        FaceBottom.Rotate(-1);
        Vec.$assign(pas.uVector.Vector(x[i],y[i],1));
        Part.FVertices.Add(Vec);
        FaceTop.AddVector(pas.uVector.TVector.$clone(Vec),true);
      };
      Part.FFaces.Add(FaceBottom);
      Part.FFaces.Add(FaceTop);
      for (i = 0; i <= 62; i++) {
        FaceSide = Part.AddFace([(i * 2) + 1,i * 2,(i * 2) + 2,(i * 2) + 3]);
        FaceSide.Color = Color;
        FaceSide.SetEdgeVisibility(0,false);
        FaceSide.SetEdgeVisibility(2,false);
      };
      FaceSide = Part.AddFace([((64 - 1) * 2) + 1,(64 - 1) * 2,0,1]);
      FaceSide.Color = Color;
      FaceSide.SetEdgeVisibility(0,false);
      FaceSide.SetEdgeVisibility(2,false);
      V.$assign(pas.uVector.VectorSubtract(Top,Base));
      Height = V.Abs();
      V.Normalize();
      Part.Trans(pas.uMatrix.TMatrix.GetScaleMatrix(Radius,Radius,Height));
      a.$assign(pas.uVector.Vector(0,0,1));
      if (!V.IsNear(a)) {
        Al = Math.acos(pas.uVector.VectorDot(V,a));
        if (Math.abs(Math.abs(Al) - Math.PI) < 1e-6) {
          Part.Trans(pas.uMatrix.TMatrix.GetRotateMatrix$1(pas.uVector.Vector(1,0,0),Al))}
         else if (Math.abs(Al) > 1e-6) {
          a.$assign(pas.uVector.VectorCross(a,V));
          a.Normalize();
          Part.Trans(pas.uMatrix.TMatrix.GetRotateMatrix$1(a,Al));
        };
      };
      Part.Trans(pas.uMatrix.TMatrix.GetMoveMatrix(Base));
    };
    this.AddCircle = function (Part, Base, Center, Radius, Color) {
      var i = 0;
      var Al = 0.0;
      var V = pas.uVector.TVector.$new();
      var a = pas.uVector.TVector.$new();
      var Face = null;
      Face = pas.uFace.TFace.$create("Create$1",[Part.FVertices]);
      for (i = 0; i <= 63; i++) {
        Al = (i * 2 * Math.PI) / 64;
        V.$assign(pas.uVector.Vector(Math.cos(Al),Math.sin(Al),0));
        Part.AddVertex(V);
        Face.AddVector(pas.uVector.TVector.$clone(V),true);
      };
      Face.Color = Color;
      Part.FFaces.Add(Face);
      V.$assign(pas.uVector.VectorSubtract(Center,Base));
      V.Normalize();
      Part.Trans(pas.uMatrix.TMatrix.GetScaleMatrix(Radius,Radius,1));
      a.$assign(pas.uVector.Vector(0,0,1));
      if (!V.IsNear(a)) {
        Al = Math.acos(pas.uVector.VectorDot(V,a));
        if (Math.abs(Math.abs(Al) - Math.PI) < 1e-6) {
          Part.Trans(pas.uMatrix.TMatrix.GetRotateMatrix$1(pas.uVector.Vector(1,0,0),Al))}
         else if (Math.abs(Al) > 1e-6) {
          a.$assign(pas.uVector.VectorCross(a,V));
          a.Normalize();
          Part.Trans(pas.uMatrix.TMatrix.GetRotateMatrix$1(a,Al));
        };
      };
      Part.Trans(pas.uMatrix.TMatrix.GetMoveMatrix(Center));
    };
    this.Transfer = function (Puzzle, XmlNode) {
      var STransfer = "";
      var VTransfer = pas.uVector.TVector.$new();
      STransfer = XmlNode.GetAttribute("Vector");
      if (STransfer !== "") {
        VTransfer.$assign($mod.TXmlReadWrite.GetVectorFromString(STransfer));
        Puzzle.Trans(pas.uMatrix.TMatrix.GetMoveMatrix(VTransfer));
      };
    };
    this.Turn = function (Puzzle, XmlNode) {
      var Angle = 0.0;
      var SNorm = "";
      var SBase = "";
      var AxisNo = 0;
      var LayerFrom = 0;
      var LayerTo = 0;
      var Layer = 0;
      var i = 0;
      var Layers = [];
      var IsLayersMove = false;
      var V = pas.uVector.TVector.$new();
      var VS = pas.uVector.TVector.$new();
      AxisNo = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Axis",0);
      pas.uSelection.TSelection.TurnAxisNo = AxisNo;
      Layers = rtl.arraySetLength(Layers,false,Puzzle.FAxes.GetItem(AxisNo).Layers.FLength);
      for (var $l = 0, $end = rtl.length(Layers) - 1; $l <= $end; $l++) {
        i = $l;
        Layers[i] = false;
      };
      LayerFrom = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"From",-1);
      LayerTo = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"To",-1);
      if ((LayerFrom >= 0) && (LayerTo === -1)) LayerTo = Puzzle.FAxes.GetItem(AxisNo).Layers.FLength;
      if ((LayerTo >= 0) && (LayerFrom === -1)) LayerFrom = 0;
      if ((LayerFrom >= 0) && (LayerTo >= LayerFrom)) for (var $l1 = LayerFrom, $end1 = LayerTo; $l1 <= $end1; $l1++) {
        i = $l1;
        Layers[i] = true;
      };
      Layer = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Layer",-1);
      if (Layer >= 0) Layers[Layer] = true;
      $mod.TXmlReadWrite.DecodeLayers(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Layers"),{get: function () {
          return Layers;
        }, set: function (v) {
          Layers = v;
        }});
      Angle = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"Angle");
      IsLayersMove = false;
      for (var $l2 = 0, $end2 = rtl.length(Layers) - 1; $l2 <= $end2; $l2++) {
        i = $l2;
        IsLayersMove = IsLayersMove || Layers[i];
      };
      if (IsLayersMove) {
        Puzzle.CalcMovingLayers(AxisNo,Layers);
        Puzzle.MacroRotateLayers(AxisNo,pas.uSelection.TSelection.TurnLayers,Angle);
      } else {
        SNorm = XmlNode.GetAttribute("NormVector");
        if (SNorm !== "") {
          V.$assign($mod.TXmlReadWrite.GetVectorFromString(SNorm));
          V.Normalize();
          SBase = XmlNode.GetAttribute("BaseVector");
          if (SBase !== "") {
            VS.$assign($mod.TXmlReadWrite.GetVectorFromString(SBase));
            Puzzle.Trans(pas.uMatrix.TMatrix.GetMoveMatrix(pas.uVector.VectorNegate(VS)));
            Puzzle.Trans(pas.uMatrix.TMatrix.GetRotateMatrix$1(V,Angle));
            Puzzle.Trans(pas.uMatrix.TMatrix.GetMoveMatrix(VS));
          } else Puzzle.Trans(pas.uMatrix.TMatrix.GetRotateMatrix$1(V,Angle));
        };
      };
    };
    this.DecodeLayers = function (LayersString, Layers) {
      var Remaining = "";
      var Item = "";
      var RangeStart = "";
      var RangeEnd = "";
      var SeparatorPos = 0;
      var DashPos = 0;
      var LayerFrom = 0;
      var LayerTo = 0;
      var i = 0;
      Remaining = LayersString;
      while (Remaining !== "") {
        SeparatorPos = pas.System.Pos(";",Remaining);
        if (SeparatorPos > 0) {
          Item = pas.System.Copy(Remaining,1,SeparatorPos - 1);
          pas.System.Delete({get: function () {
              return Remaining;
            }, set: function (v) {
              Remaining = v;
            }},1,SeparatorPos);
        } else {
          Item = Remaining;
          Remaining = "";
        };
        Item = $impl.XmlTrim(Item);
        if (Item === "") continue;
        DashPos = pas.System.Pos("-",Item);
        if (DashPos === 0) {
          LayerFrom = Math.round(pas.uScript.CalcExpression(Item,0));
          if ((LayerFrom >= 0) && (LayerFrom < rtl.length(Layers.get()))) Layers.get()[LayerFrom] = true;
        } else {
          RangeStart = $impl.XmlTrim(pas.System.Copy(Item,1,DashPos - 1));
          RangeEnd = $impl.XmlTrim(pas.System.Copy(Item,DashPos + 1,Item.length));
          LayerFrom = Math.round(pas.uScript.CalcExpression(RangeStart,0));
          LayerTo = Math.round(pas.uScript.CalcExpression(RangeEnd,0));
          if ((LayerFrom >= 0) && (LayerFrom < rtl.length(Layers.get())) && (LayerTo > 0) && (LayerTo < rtl.length(Layers.get()))) for (var $l = LayerFrom, $end = LayerTo; $l <= $end; $l++) {
            i = $l;
            Layers.get()[i] = true;
          };
        };
      };
    };
    this.LoadArrayFromString = function (Names) {
      var Result = [];
      var i = 0;
      var Count = 0;
      var Token = "";
      Result = rtl.arraySetLength(Result,0.0,0);
      Token = "";
      Count = 0;
      for (var $l = 1, $end = Names.length + 1; $l <= $end; $l++) {
        i = $l;
        if ((i > Names.length) || (Names.charAt(i - 1) === ";")) {
          Token = $impl.XmlTrim(Token);
          if (Token !== "") {
            Result = rtl.arraySetLength(Result,0.0,Count + 1);
            Result[Count] = pas.uScript.CalcExpression(Token,0);
            Count += 1;
          };
          Token = "";
        } else Token = Token + Names.charAt(i - 1);
      };
      return Result;
    };
    this.GetAttrOrParent = function (XmlNode, aName, aDefault) {
      var Result = "";
      Result = aDefault;
      if (XmlNode === null) return Result;
      Result = XmlNode.GetAttribute(aName);
      if (Result !== "") return Result;
      XmlNode = XmlNode.GetParentNode();
      if (XmlNode === null) return Result;
      Result = XmlNode.GetAttribute(aName);
      if (Result === "") Result = aDefault;
      return Result;
    };
    this.GetVectorFromString = function (S) {
      var Result = pas.uVector.TVector.$new();
      Result.x = pas.uScript.CalcExpression($impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},";")),0);
      Result.y = pas.uScript.CalcExpression($impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},";")),0);
      Result.z = pas.uScript.CalcExpression($impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},";")),0);
      return Result;
    };
    this.GetVectorsFromString = function (S, Vectors) {
      var $Self = this;
      var isArray = rtl.arraySetLength(null,false,3);
      var ArrayName = rtl.arraySetLength(null,"",3);
      var vec = rtl.arraySetLength(null,0.0,3);
      function GetArrayValue(i, Dim) {
        var Result = false;
        var V = pas.uScript.TVar.$new();
        if (!isArray[Dim]) return true;
        Result = pas.uScript.Calc.VarByName(ArrayName[Dim] + "[" + $impl.XmlIntToStr(i) + "]",V);
        if (Result) {
          vec[Dim] = pas.uScript.CalcExpression(ArrayName[Dim] + "[" + $impl.XmlIntToStr(i) + "]",0)}
         else vec[Dim] = 0;
        return Result;
      };
      function InitDim(Dim) {
        isArray[Dim] = true;
        ArrayName[Dim] = $impl.XmlUpperCase($impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},";")));
        isArray[Dim] = GetArrayValue(0,Dim);
        if (!isArray[Dim]) vec[Dim] = pas.uScript.CalcExpression(ArrayName[Dim],0);
      };
      var i = 0;
      if (S === "") return;
      InitDim(0);
      InitDim(1);
      InitDim(2);
      Vectors.Add(pas.uVector.Vector(vec[0],vec[1],vec[2]));
      if (isArray[0] || isArray[1] || isArray[2]) for (i = 1; i <= 2147483647; i++) {
        if (GetArrayValue(i,0) && GetArrayValue(i,1) && GetArrayValue(i,2)) {
          Vectors.Add(pas.uVector.Vector(vec[0],vec[1],vec[2]))}
         else break;
      };
    };
    this.VectorLoadFromXml = function (Vector, XmlNode) {
      var Result = false;
      Result = false;
      if (XmlNode === null) return Result;
      Vector.x = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"X");
      Vector.y = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"Y");
      Vector.z = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"Z");
      Result = true;
      return Result;
    };
    this.VectorsLoadFromXml = function (Vectors, XmlNode) {
      var $Self = this;
      var Result = false;
      function ExecMacro(XmlNode) {
        var Result = false;
        var i = 0;
        var n = 0;
        var MacroNodes = null;
        var MacroNode = null;
        Result = false;
        MacroNodes = pas["Generics.Collections"].TList$G19.$create("Create$1");
        try {
          if ($Self.FindMacros(XmlNode,{get: function () {
              return MacroNodes;
            }, set: function (v) {
              MacroNodes = v;
            }},{get: function () {
              return n;
            }, set: function (v) {
              n = v;
            }})) for (var $l = 0, $end = n - 1; $l <= $end; $l++) {
            i = $l;
            var $in = MacroNodes.GetEnumerator$1();
            try {
              while ($in.MoveNext()) {
                MacroNode = $in.DoGetCurrent();
                if (!$Self.VectorsLoadFromXml(Vectors,MacroNode)) return Result;
              }
            } finally {
              $in = rtl.freeLoc($in)
            };
          };
          Result = true;
        } finally {
          MacroNodes = rtl.freeLoc(MacroNodes);
        };
        return Result;
      };
      var i = 0;
      var XmlSubNode = null;
      var Vector = pas.uVector.TVector.$new();
      var S = "";
      Result = false;
      if (XmlNode === null) return Result;
      this.GetVectorsFromString(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Vectors"),Vectors);
      for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
        i = $l;
        XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
        S = XmlSubNode.GetNodeName();
        if (S === "Script") {
          pas.uScript.ExecuteScript(pas.uXmlUtils.GetNodeText(XmlSubNode))}
         else if (S === "Vector") {
          if (!this.VectorLoadFromXml(Vector,XmlSubNode)) return Result;
          Vectors.Add(Vector);
        } else if (S === "Add") {
          S = pas.uXmlUtils.GetAttrFromXml(XmlSubNode,"Vector","");
          if (S !== "") Vectors.Add(this.GetVectorFromString(S));
        } else if (S === "ExecMacro") {
          if (!ExecMacro(XmlSubNode)) return Result;
        };
      };
      Result = true;
      return Result;
    };
    this.LineLoadFromXml = function (Line, XmlNode) {
      var Result = false;
      if (!pas.uXmlUtils.ReadVectorFromXml(Line.BaseVector,XmlNode,"BaseVector")) Line.BaseVector.$assign(pas.uVector.Vector(0,0,0));
      if (!pas.uXmlUtils.ReadVectorFromXml(Line.NormVector,XmlNode,"NormVector")) Line.NormVector.$assign(pas.uVector.Vector(1,0,0));
      Line.NormVector.Normalize();
      Result = true;
      return Result;
    };
    this.PlaneLoadFromXml = function (Plane, XmlNode) {
      var Result = false;
      var BaseVector = pas.uVector.TVector.$new();
      if (XmlNode === null) return false;
      if (!pas.uXmlUtils.ReadVectorFromXml(BaseVector,XmlNode,"BaseVector")) BaseVector.$assign(pas.uVector.Vector(0,0,0));
      if (!pas.uXmlUtils.ReadVectorFromXml(Plane.NormVect,XmlNode,"NormVector")) Plane.NormVect.$assign(pas.uVector.Vector(0,0,1));
      Plane.NormVect.Normalize();
      Plane.NormDistance = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"NormDistance") + pas.uVector.VectorDot(BaseVector,Plane.NormVect);
      Result = true;
      return Result;
    };
    this.AxisLoadFromXml = function (Axis, XmlNode) {
      var Result = false;
      var NormVectorText = "";
      Result = false;
      if (!this.LineLoadFromXml(Axis.Line,XmlNode)) return Result;
      NormVectorText = XmlNode.GetAttribute("NormVector");
      if (NormVectorText !== "") Axis.Line.NormVector.$assign(this.GetVectorFromString(NormVectorText));
      Axis.Line.NormVector.Normalize();
      this.FillAxis(Axis,this.GetAttrOrParent(XmlNode,"PlaneDistances",""),pas.uXmlUtils.ReadStringFromXmlOrParent(XmlNode,"TurningAngles"),pas.uXmlUtils.ReadStringFromXmlOrParent(XmlNode,"AvailableAngles"),pas.uXmlUtils.ReadStringFromXmlOrParent(XmlNode,"JumbleAngle"),pas.uXmlUtils.ReadStringFromXmlOrParent(XmlNode,"FixedLayers"),pas.uXmlUtils.ReadStringFromXmlOrParent(XmlNode,"MinAngles"),pas.uXmlUtils.ReadStringFromXmlOrParent(XmlNode,"MaxAngles"),pas.uXmlUtils.ReadIntExpressionFromXmlOrParent(XmlNode,"TurnAxesWithLayer",-1),pas.uXmlUtils.ReadIntExpressionFromXmlOrParent(XmlNode,"TurnAxesWithPartNo",-1));
      Result = true;
      return Result;
    };
    this.FillAxis = function (Axis, PlaneDistances, TurningAngles, AvailableAngles, JumbleAngle, FixedLayers, MinAngles, MaxAngles, TurnAxesWithLayer, TurnAxesWithPartNo) {
      var $Self = this;
      function AddAvailableAngle(Angle) {
        var Layer = null;
        Angle = pas.uUtils.TUtils.PrivPi(Angle);
        var $in = Axis.Layers.GetEnumerator$1();
        try {
          while ($in.MoveNext()) {
            Layer = $in.DoGetCurrent();
            if (!Layer.Fixed) Layer.AddAvailableAngle(Angle);
          }
        } finally {
          $in = rtl.freeLoc($in)
        };
      };
      function AddJumbleAngles(Angle) {
        var i = 0;
        var TurningAngle = 0.0;
        var Layer = null;
        var $in = Axis.Layers.GetEnumerator$1();
        try {
          while ($in.MoveNext()) {
            Layer = $in.DoGetCurrent();
            if (!Layer.Fixed) {
              TurningAngle = Layer.FTurningAngle;
              for (var $l = 0, $end = Math.round((2 * Math.PI) / TurningAngle) + 1; $l <= $end; $l++) {
                i = $l;
                Layer.AddAvailableAngle(pas.uUtils.TUtils.PrivPi((TurningAngle * i) + Angle));
                Layer.AddAvailableAngle(pas.uUtils.TUtils.PrivPi((TurningAngle * i) - Angle));
              };
            };
          }
        } finally {
          $in = rtl.freeLoc($in)
        };
      };
      var i = 0;
      var S = "";
      var SMin = "";
      var SMax = "";
      var Al = 0.0;
      var D = 0.0;
      Axis.CreateLayers(this.LoadArrayFromString(PlaneDistances));
      S = TurningAngles;
      if (pas.System.Pos(";",S) !== 0) {
        for (var $l = 0, $end = Axis.Layers.FLength - 1; $l <= $end; $l++) {
          i = $l;
          Axis.Layers.GetItem(i).SetTurningAngle(pas.uScript.CalcExpression($impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
              return S;
            }, set: function (v) {
              S = v;
            }},";")),0));
        }}
       else {
        Al = pas.uScript.CalcExpression(S,0);
        for (var $l1 = 0, $end1 = Axis.Layers.FLength - 1; $l1 <= $end1; $l1++) {
          i = $l1;
          Axis.Layers.GetItem(i).SetTurningAngle(Al);
        };
      };
      for (var $l2 = 0, $end2 = Axis.Layers.FLength - 1; $l2 <= $end2; $l2++) {
        i = $l2;
        var $with = Axis.Layers.GetItem(i);
        if (Math.abs($with.FTurningAngle) < 1E-4) $with.Fixed = true;
      };
      S = FixedLayers;
      while ($impl.XmlTrim(S) !== "") {
        i = Math.round(pas.uScript.CalcExpression($impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},";")),0));
        if ((i >= 0) && (i < Axis.Layers.FLength)) {
          Axis.Layers.GetItem(i).Fixed = true}
         else pas.uUtils.TUtils.Log("FillAxis: FixedLayers out of bounds: " + $impl.XmlIntToStr(i));
      };
      S = AvailableAngles;
      while ($impl.XmlTrim(S) !== "") AddAvailableAngle(pas.uScript.CalcExpression($impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
          return S;
        }, set: function (v) {
          S = v;
        }},";")),0));
      D = pas.uScript.CalcExpression(JumbleAngle,0);
      if (D !== 0) AddJumbleAngles(D);
      SMin = MinAngles;
      SMax = MaxAngles;
      for (var $l3 = 0, $end3 = Axis.Layers.FLength - 1; $l3 <= $end3; $l3++) {
        i = $l3;
        if ((SMin !== "") || (SMax !== "")) {
          S = $impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
              return SMin;
            }, set: function (v) {
              SMin = v;
            }},";"));
          if (S !== "") Axis.Layers.GetItem(i).MinAngle = pas.uScript.CalcExpression(S,0);
          S = $impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
              return SMax;
            }, set: function (v) {
              SMax = v;
            }},";"));
          if (S !== "") Axis.Layers.GetItem(i).MaxAngle = pas.uScript.CalcExpression(S,0);
        };
      };
      Axis.TurnAxesWithLayer = TurnAxesWithLayer;
      Axis.TurnAxesWithPartNo = TurnAxesWithPartNo;
    };
    this.AxesLoadFromXml = function (Axes, XmlNode) {
      var $Self = this;
      var Result = false;
      var i = 0;
      var i1 = 0;
      var i2 = 0;
      var Axis = null;
      var S1 = "";
      var S2 = "";
      var S3 = "";
      var S4 = "";
      var S5 = "";
      var S6 = "";
      var S7 = "";
      var Vectors = null;
      Result = false;
      Vectors = pas["Generics.Collections"].TList$G7.$create("Create$1");
      try {
        this.GetVectorsFromString(XmlNode.GetAttribute("NormVectors"),Vectors);
        if (Vectors.FLength > 0) {
          S1 = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"PlaneDistances");
          S2 = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"TurningAngles");
          S3 = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"AvailableAngles");
          S4 = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"JumbleAngle");
          S5 = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"FixedLayers");
          S6 = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"MinAngles");
          S7 = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"MaxAngles");
          i1 = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"TurnAxesWithLayer",-1);
          i2 = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"TurnAxesWithPartNo",-1);
        };
        for (var $l = 0, $end = Vectors.FLength - 1; $l <= $end; $l++) {
          i = $l;
          Axis = pas.uAxis.TAxis.$create("Create$1");
          Axis.Line.NormVector.x = Vectors.GetItem(i).x;
          Axis.Line.NormVector.y = Vectors.GetItem(i).y;
          Axis.Line.NormVector.z = Vectors.GetItem(i).z;
          Axis.Line.NormVector.Normalize();
          this.FillAxis(Axis,S1,S2,S3,S4,S5,S6,S7,i1,i2);
          Axes.Add(Axis);
        };
      } finally {
        Vectors = rtl.freeLoc(Vectors);
      };
      for (var $l1 = 0, $end1 = XmlNode.GetChildNodes().Count() - 1; $l1 <= $end1; $l1++) {
        i = $l1;
        if (XmlNode.GetChildNodes().GetItem(i).CompareName("Axis") === 0) {
          Axis = pas.uAxis.TAxis.$create("Create$1");
          if (!this.AxisLoadFromXml(Axis,XmlNode.GetChildNodes().GetItem(i))) return Result;
          Axes.Add(Axis);
        };
      };
      Result = true;
      return Result;
    };
    this.FaceLoadFromXml = function (Face, XmlNode) {
      var $Self = this;
      var Result = false;
      function AddIndexesFromString(S) {
        var Splitted = [];
        var VIndex = "";
        Splitted = pas.strutils.SplitString(S,";");
        for (var $in = Splitted, $l = 0, $end = rtl.length($in) - 1; $l <= $end; $l++) {
          VIndex = $in[$l];
          Face.AddVertexByIndex(Math.round(pas.uScript.CalcExpression($impl.XmlTrim(VIndex),0)),true);
        };
      };
      var i = 0;
      var InvisibleEdges = 0;
      Face.Clear();
      Face.Color = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"Color",-1);
      AddIndexesFromString($impl.XmlTrim(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"VertexIndexes")));
      InvisibleEdges = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"InvisibleEdges",0);
      if (InvisibleEdges !== 0) for (var $l = 0, $end = Face.GetVertexCount() - 1; $l <= $end; $l++) {
        i = $l;
        Face.SetEdgeVisibility(i,(InvisibleEdges & (1 << i)) === 0);
      };
      Result = true;
      return Result;
    };
    this.FacesLoadFromXml = function (Faces, XmlNode, Points) {
      var $Self = this;
      var Result = false;
      var i = 0;
      var XmlSubNode = null;
      var Face = null;
      var S = "";
      function ExecMacro(XmlNode) {
        var Result = false;
        var i = 0;
        var n = 0;
        var MacroNodes = null;
        var MacroNode = null;
        Result = false;
        MacroNodes = pas["Generics.Collections"].TList$G19.$create("Create$1");
        try {
          if ($Self.FindMacros(XmlNode,{get: function () {
              return MacroNodes;
            }, set: function (v) {
              MacroNodes = v;
            }},{get: function () {
              return n;
            }, set: function (v) {
              n = v;
            }})) for (var $l = 0, $end = n - 1; $l <= $end; $l++) {
            i = $l;
            var $in = MacroNodes.GetEnumerator$1();
            try {
              while ($in.MoveNext()) {
                MacroNode = $in.DoGetCurrent();
                if (!$Self.FacesLoadFromXml(Faces,MacroNode,Points)) return Result;
              }
            } finally {
              $in = rtl.freeLoc($in)
            };
          };
          Result = true;
        } finally {
          MacroNodes = rtl.freeLoc(MacroNodes);
        };
        return Result;
      };
      Result = false;
      if (XmlNode === null) return Result;
      for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
        i = $l;
        XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
        S = XmlSubNode.GetNodeName();
        if (S === "Face") {
          Face = pas.uFace.TFace.$create("Create$1",[Points]);
          if (!this.FaceLoadFromXml(Face,XmlSubNode)) return Result;
          Faces.Add(Face);
        } else if (S === "ExecMacro") {
          if (!ExecMacro(XmlSubNode)) return Result;
        } else if (S === "Script") pas.uScript.ExecuteScript(pas.uXmlUtils.DomValueToString(XmlSubNode.GetTextContent()));
      };
      Result = true;
      return Result;
    };
    this.PartLoadFromXml = function (Part, XmlNode) {
      var Result = false;
      var i = 0;
      var XmlSubNode = null;
      var S = "";
      Part.Clear();
      for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
        i = $l;
        XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
        S = XmlSubNode.GetNodeName();
        if (S === "Script") {
          pas.uScript.ExecuteScript(pas.uXmlUtils.DomValueToString(XmlSubNode.GetTextContent()))}
         else if (S === "Vertices") {
          this.VectorsLoadFromXml(Part.FVertices,XmlSubNode)}
         else if (S === "Faces") this.FacesLoadFromXml(Part.FFaces,XmlSubNode,Part.FVertices);
      };
      Result = (Part.FFaces.FLength !== 0) && (Part.FVertices.FLength !== 0);
      return Result;
    };
    this.PartLoadCylinder = function (Part, XmlNode) {
      var Result = false;
      var Radius = 0.0;
      var Color = 0;
      var BaseColor = 0;
      var TopColor = 0;
      var Base = pas.uVector.TVector.$new();
      var Top = pas.uVector.TVector.$new();
      Result = false;
      if (XmlNode === null) return Result;
      Radius = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"Radius");
      Color = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"Color",-1);
      pas.uXmlUtils.ReadVectorFromXml(Base,XmlNode,"Base");
      BaseColor = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"BaseColor",-1);
      if (BaseColor === -1) BaseColor = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode.FindNode("Base"),"Color",-1);
      pas.uXmlUtils.ReadVectorFromXml(Top,XmlNode,"Top");
      TopColor = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"TopColor",-1);
      if (TopColor === -1) TopColor = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode.FindNode("Top"),"Color",-1);
      this.AddCylinder(Part,Base,Top,Radius,Color,BaseColor,TopColor);
      Result = true;
      return Result;
    };
    this.PartLoadCircle = function (Part, XmlNode) {
      var Result = false;
      var Base = pas.uVector.TVector.$new();
      var Center = pas.uVector.TVector.$new();
      var Radius = 0.0;
      var Color = 0;
      Result = false;
      if (XmlNode === null) return Result;
      Radius = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"Radius");
      Color = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"Color",-1);
      if (!pas.uXmlUtils.ReadVectorFromXml(Base,XmlNode,"Base")) Base.$assign(pas.uVector.Vector(0,0,0));
      if (!pas.uXmlUtils.ReadVectorFromXml(Center,XmlNode,"Center")) Center.$assign(pas.uVector.Vector(1,0,0));
      this.AddCircle(Part,Base,Center,Radius,Color);
      Result = true;
      return Result;
    };
    this.PuzzleCheckVersionFromXml = function (Puzzle, XmlNode) {
      var Result = false;
      Result = $impl.XmlStrToInt(XmlNode.GetAttribute("Data_Version")) === $mod.XML_VERSION;
      return Result;
    };
    this.PuzzleLoadHeaderFromXml = function (Puzzle, XmlNode) {
      var Result = false;
      var InterfaceNode = null;
      var FileName = "";
      Result = false;
      FileName = Puzzle.Header.FileName;
      Puzzle.ClearHeader();
      Puzzle.Header.FileName = FileName;
      if (XmlNode === null) return Result;
      if (!this.PuzzleCheckVersionFromXml(Puzzle,XmlNode)) return Result;
      InterfaceNode = XmlNode.FindNode("Interface");
      if (InterfaceNode === null) return Result;
      var $with = Puzzle.Header;
      $with.Name = pas.uXmlUtils.ReadStringFromXml$2(InterfaceNode,"Name");
      $with.Aliases = pas.uXmlUtils.ReadStringFromXml$2(InterfaceNode,"Aliases");
      $with.ClassString = pas.uXmlUtils.ReadStringFromXml$2(InterfaceNode,"Class");
      $with.MenuString = pas.uXmlUtils.ReadMultiStringFromXml(InterfaceNode,"Menu",";");
      $with.Inventor = pas.uXmlUtils.ReadStringFromXml$2(InterfaceNode,"Inventor");
      $with.Programmer = pas.uXmlUtils.ReadStringFromXml$2(InterfaceNode,"Programmer");
      $with.Added = pas.uXmlUtils.ReadStringFromXml$2(InterfaceNode,"Added");
      $with.Link = pas.uXmlUtils.ReadMultiStringFromXml(InterfaceNode,"Link",";");
      Result = true;
      return Result;
    };
    this.PuzzleLoadFromXml = function (Puzzle, XmlNode) {
      var $Self = this;
      var Result = false;
      function UndoRepeat(XmlNode) {
        var i = 0;
        var n = 0;
        n = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Repeat",1);
        for (var $l = 0, $end = n - 1; $l <= $end; $l++) {
          i = $l;
          if (!Puzzle.Undo(false)) return;
        };
      };
      function Split(XmlNode) {
        var AxisNo = 0;
        var FromPlane = 0;
        var PlaneX = pas.uPlane.TPlane.$new();
        var Color1 = 0;
        var Color2 = 0;
        var InvisibleEdges1 = 0;
        var InvisibleEdges2 = 0;
        AxisNo = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Axis",-1);
        FromPlane = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"From",-1) - 1;
        Color1 = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"Color1",-1);
        Color2 = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"Color2",-1);
        InvisibleEdges1 = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"InvisibleEdges1",0);
        InvisibleEdges2 = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"InvisibleEdges2",0);
        if ((AxisNo !== -1) && (FromPlane !== -1)) {
          pas.uPuzzleUtils.TPuzzleUtils.SplitByPlane(Puzzle,pas.uPlane.TPlane.$clone(Puzzle.FAxes.GetItem(AxisNo).GetLayerPlaneTo(FromPlane)),Color1,Color2,InvisibleEdges1,InvisibleEdges2)}
         else {
          if ($Self.PlaneLoadFromXml(PlaneX,XmlNode.FindNode("Plane"))) pas.uPuzzleUtils.TPuzzleUtils.SplitByPlane(Puzzle,pas.uPlane.TPlane.$clone(PlaneX),Color1,Color2,InvisibleEdges1,InvisibleEdges2);
        };
      };
      function Cut(XmlNode) {
        var AxisNo = 0;
        var FromPlane = 0;
        var ToPlane = 0;
        var PlaneX = pas.uPlane.TPlane.$new();
        var Color = 0;
        var InvisibleEdges = 0;
        AxisNo = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Axis",-1);
        InvisibleEdges = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"InvisibleEdges",0);
        if (AxisNo !== -1) {
          FromPlane = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"From",-1) - 1;
          ToPlane = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"To",-1) - 1;
          Color = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"Color",-1);
          if (FromPlane > -1) pas.uPuzzleUtils.TPuzzleUtils.CutByPlane(Puzzle,pas.uPlane.TPlane.$clone(Puzzle.FAxes.GetItem(AxisNo).GetLayerPlaneTo(FromPlane)),Color,InvisibleEdges);
          if (ToPlane !== -2) {
            PlaneX.$assign(Puzzle.FAxes.GetItem(AxisNo).GetLayerPlaneTo(ToPlane));
            PlaneX.TurnRound();
            pas.uPuzzleUtils.TPuzzleUtils.CutByPlane(Puzzle,pas.uPlane.TPlane.$clone(PlaneX),Color,InvisibleEdges);
          };
        } else {
          if ($Self.PlaneLoadFromXml(PlaneX,XmlNode.FindNode("Plane"))) {
            Color = pas.uXmlUtils.ReadColorExpressionFromXml(XmlNode,"Color",-1);
            pas.uPuzzleUtils.TPuzzleUtils.CutByPlane(Puzzle,pas.uPlane.TPlane.$clone(PlaneX),Color,InvisibleEdges);
          };
        };
      };
      function Hide(XmlNode) {
        var AxisNo = 0;
        var FromLayer = 0;
        var ToLayer = 0;
        var Layer = 0;
        var iFrom = 0;
        var iTo = 0;
        var PlaneX = pas.uPlane.TPlane.$new();
        var hp = 0;
        var i = 0;
        var j = 0;
        var Layers = [];
        var sLayers = "";
        AxisNo = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Axis",-1);
        if (AxisNo !== -1) {
          FromLayer = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"From",-1);
          ToLayer = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"To",-1);
          Layer = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Layer",-1);
          if ((FromLayer > -1) && (ToLayer === -1) && (Layer === -1)) {
            ToLayer = Puzzle.FAxes.GetItem(AxisNo).Layers.FLength - 1}
           else if ((FromLayer === -1) && (ToLayer > -1) && (Layer === -1)) {
            FromLayer = 0}
           else if (((FromLayer === -1) || (ToLayer === -1)) && (Layer !== -1)) {
            FromLayer = Layer;
            ToLayer = Layer;
          };
          for (var $l = 0, $end = Puzzle.FParts.FLength - 1; $l <= $end; $l++) {
            i = $l;
            Puzzle.GetPartPosition(AxisNo,i,{get: function () {
                return iFrom;
              }, set: function (v) {
                iFrom = v;
              }},{get: function () {
                return iTo;
              }, set: function (v) {
                iTo = v;
              }});
            if ((iFrom >= FromLayer) && (iTo <= ToLayer)) Puzzle.FParts.GetItem(i).FVisible = false;
          };
          sLayers = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Layers");
          if (sLayers !== "") {
            Layers = rtl.arraySetLength(Layers,false,Puzzle.FAxes.GetItem(AxisNo).Layers.FLength);
            $Self.DecodeLayers(sLayers,{get: function () {
                return Layers;
              }, set: function (v) {
                Layers = v;
              }});
            for (var $l1 = 0, $end1 = Puzzle.FParts.FLength - 1; $l1 <= $end1; $l1++) {
              i = $l1;
              Puzzle.GetPartPosition(AxisNo,i,{get: function () {
                  return iFrom;
                }, set: function (v) {
                  iFrom = v;
                }},{get: function () {
                  return iTo;
                }, set: function (v) {
                  iTo = v;
                }});
              for (var $l2 = iFrom, $end2 = iTo; $l2 <= $end2; $l2++) {
                j = $l2;
                if (Layers[j]) Puzzle.FParts.GetItem(i).FVisible = false;
              };
            };
          };
        } else {
          if ($Self.PlaneLoadFromXml(PlaneX,XmlNode.FindNode("Plane"))) {
            for (var $l3 = 0, $end3 = Puzzle.FParts.FLength - 1; $l3 <= $end3; $l3++) {
              i = $l3;
              hp = Puzzle.FParts.GetItem(i).HalfPlane(PlaneX);
              if (hp === pas.uGeometryUtils.THalfOfPlane.hopInside) Puzzle.FParts.GetItem(i).FVisible = false;
            };
          };
        };
      };
      function HideContaining(XmlNode) {
        var Vector = pas.uVector.TVector.$new();
        var Vectors = null;
        var Part = null;
        Vectors = pas["Generics.Collections"].TList$G7.$create("Create$1");
        try {
          $Self.GetVectorsFromString(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Vectors"),Vectors);
          $Self.GetVectorsFromString(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Vector"),Vectors);
          var $in = Puzzle.FParts.GetEnumerator$1();
          try {
            while ($in.MoveNext()) {
              Part = $in.DoGetCurrent();
              if (Part.FVisible) {
                var $in1 = Vectors.GetEnumerator$1();
                try {
                  while ($in1.MoveNext()) {
                    Vector = $in1.DoGetCurrent();
                    if (Part.Contains(Vector)) {
                      Part.FVisible = false;
                      break;
                    };
                  }
                } finally {
                  $in1 = rtl.freeLoc($in1)
                };
              };
            }
          } finally {
            $in = rtl.freeLoc($in)
          };
        } finally {
          Vectors = rtl.freeLoc(Vectors);
        };
      };
      function RemoveAllVisible() {
        var Part = null;
        var i = 0;
        for (var $l = Puzzle.FParts.FLength - 1; $l >= 0; $l--) {
          i = $l;
          Part = Puzzle.FParts.GetItem(i);
          if (Part.FVisible) {
            Part = rtl.freeLoc(Part);
            Puzzle.FParts.Delete(i);
            Puzzle.PositionsInvalidate();
          };
        };
      };
      function RemoveContaining(XmlNode) {
        var Vector = pas.uVector.TVector.$new();
        var Vectors = null;
        var Part = null;
        var i = 0;
        Vectors = pas["Generics.Collections"].TList$G7.$create("Create$1");
        try {
          $Self.GetVectorsFromString(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Vectors"),Vectors);
          $Self.GetVectorsFromString(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Vector"),Vectors);
          for (var $l = Puzzle.FParts.FLength - 1; $l >= 0; $l--) {
            i = $l;
            Part = Puzzle.FParts.GetItem(i);
            if (Part.FVisible) {
              var $in = Vectors.GetEnumerator$1();
              try {
                while ($in.MoveNext()) {
                  Vector = $in.DoGetCurrent();
                  if (Part.Contains(Vector)) {
                    Part = rtl.freeLoc(Part);
                    Puzzle.FParts.Delete(i);
                    Puzzle.PositionsInvalidate();
                    break;
                  };
                }
              } finally {
                $in = rtl.freeLoc($in)
              };
            };
          };
        } finally {
          Vectors = rtl.freeLoc(Vectors);
        };
      };
      function SetSpike(XmlNode) {
        var Vector = pas.uVector.TVector.$new();
        var Vectors = null;
        var Level = 0;
        var Face = null;
        Vectors = pas["Generics.Collections"].TList$G7.$create("Create$1");
        try {
          Level = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Level",0);
          if (Level !== 0) {
            $Self.GetVectorsFromString(pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Near"),Vectors);
            var $in = Vectors.GetEnumerator$1();
            try {
              while ($in.MoveNext()) {
                Vector = $in.DoGetCurrent();
                Face = pas.uPuzzleUtils.TPuzzleUtils.GetNearestVisibleFace(Puzzle,pas.uVector.TVector.$clone(Vector));
                if (Face !== null) Face.SetSpike(Level);
              }
            } finally {
              $in = rtl.freeLoc($in)
            };
          };
        } finally {
          Vectors = rtl.freeLoc(Vectors);
        };
      };
      function LoadProcedures(XmlNode) {
        var ProcName = "";
        if (XmlNode === null) return;
        pas.uXmlUtils.ReadStringFromXml(XmlNode,"CheckSolved",{get: function () {
            return ProcName;
          }, set: function (v) {
            ProcName = v;
          }},"");
        if ($impl.XmlSameText(ProcName,"EachColorHasSameOrOppositeDirection")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspEachColorHasSameOrOppositeDirection}
         else if ($impl.XmlSameText(pas.System.Copy(ProcName,1,17),"CountUniquePlanes")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspCountUniquePlanes;
          pas.uUtils.TUtils.Parse({get: function () {
              return ProcName;
            }, set: function (v) {
              ProcName = v;
            }},"=");
          Puzzle.FSolvedStates.UniquePlanes = pas.uUtils.TUtils.ParseInt({get: function () {
              return ProcName;
            }, set: function (v) {
              ProcName = v;
            }});
        } else if ($impl.XmlSameText(ProcName,"EachFaceConsistsOfDifferentColors")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspEachFaceConsistsOfDifferentColors}
         else if ($impl.XmlSameText(ProcName,"EachRowColConsistsOfDifferentColors")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspEachRowColConsistsOfDifferentColors}
         else if ($impl.XmlSameText(ProcName,"EachRowColDiagConsistsOfDifferentColors")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspEachRowColDiagConsistsOfDifferentColors}
         else if ($impl.XmlSameText(ProcName,"CheckSavedStates")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspCheckSavedStates}
         else if ($impl.XmlSameText(ProcName,"EachPlaneHasOneColor")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspEachPlaneHasOneColor}
         else if ($impl.XmlSameText(pas.System.Copy(ProcName,1,44),"EachColorHasSameDirectionOrCountUniquePlanes")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspEachColorHasSameDirectionOrCountUniquePlanes;
          pas.uUtils.TUtils.Parse({get: function () {
              return ProcName;
            }, set: function (v) {
              ProcName = v;
            }},"=");
          Puzzle.FSolvedStates.UniquePlanes = pas.uUtils.TUtils.ParseInt({get: function () {
              return ProcName;
            }, set: function (v) {
              ProcName = v;
            }});
        } else if ($impl.XmlSameText(ProcName,"AdjoiningFacesHaveSameColors")) {
          Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspAdjoiningFacesHaveSameColors}
         else Puzzle.FCheckSolvedProc = pas.uPuzzle.TCheckSolvedProc.cspEachColorHasSameDirection;
      };
      function LoadTextures(XmlNode) {
        var i = 0;
        var XmlSubNode = null;
        var S = "";
        var Texture = null;
        for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
          i = $l;
          XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
          S = XmlSubNode.GetNodeName();
          if (S === "Texture") {
            Texture = pas.uTexture.TTexture.$create("Create$1");
            $Self.TextureLoadFromXml(Texture,XmlSubNode);
            Puzzle.FTextures.Add(Texture);
          };
        };
      };
      function FindByName(Name) {
        var Result = 0;
        var i = 0;
        Result = -1;
        for (var $l = 0, $end = Puzzle.FTextures.FLength - 1; $l <= $end; $l++) {
          i = $l;
          if ($impl.XmlSameText(Name,Puzzle.FTextures.GetItem(i).Name)) {
            Result = i;
            return Result;
          };
        };
        return Result;
      };
      function SetTextures(XmlNode) {
        var i = 0;
        var TextureId = 0;
        var iPart = 0;
        var iFace = 0;
        var S = "";
        var SP = "";
        var sl = null;
        var Face = null;
        var Part = null;
        sl = pas.Classes.TStringList.$create("Create$1");
        S = pas.uXmlUtils.DomValueToString(XmlNode.GetTextContent());
        sl.SetTextStr(S);
        Result = false;
        if (sl.GetCount() !== 0) {
          for (var $l = sl.GetCount() - 1; $l >= 0; $l--) {
            i = $l;
            if (($impl.XmlTrim(sl.Get(i)) === "") || (pas.System.Copy($impl.XmlTrim(sl.Get(i)),1,1) === ";")) sl.Delete(i);
          };
          for (var $l1 = 0, $end = sl.GetCount() - 1; $l1 <= $end; $l1++) {
            i = $l1;
            S = $impl.XmlTrim(sl.Get(i));
            SP = $impl.XmlTrim(pas.uUtils.TUtils.Parse({get: function () {
                return S;
              }, set: function (v) {
                S = v;
              }},"="));
            TextureId = FindByName(SP);
            if (TextureId !== -1) while ($impl.XmlTrim(S) !== "") {
              iPart = pas.uUtils.TUtils.ParseInt({get: function () {
                  return S;
                }, set: function (v) {
                  S = v;
                }});
              if ((iPart < 0) || (iPart >= Puzzle.FParts.FLength)) continue;
              Part = Puzzle.FParts.GetItem(iPart);
              if (Part === null) continue;
              iFace = pas.uUtils.TUtils.ParseInt({get: function () {
                  return S;
                }, set: function (v) {
                  S = v;
                }});
              if ((iFace < 0) || (iFace >= Part.FFaces.FLength)) continue;
              Face = Part.FFaces.GetItem(iFace);
              if (Face === null) continue;
              Face.Rotate(pas.uUtils.TUtils.ParseInt({get: function () {
                  return S;
                }, set: function (v) {
                  S = v;
                }}));
              Face.TextureId = TextureId;
            };
          };
        };
        sl = rtl.freeLoc(sl);
      };
      function LoadFrom(XmlNode) {
        var Result = false;
        var XmlDoc = null;
        var S = "";
        var AttrName = "";
        var i = 0;
        for (var $l = 0, $end = XmlNode.GetAttributes().Length() - 1; $l <= $end; $l++) {
          i = $l;
          AttrName = XmlNode.GetAttributes().GetItem(i).GetNodeName();
          if (AttrName !== "File") pas.uScript.ExecuteScript(AttrName + ":=" + XmlNode.GetAttribute(AttrName));
        };
        pas.uXmlUtils.ReadStringFromXml(XmlNode,"File",{get: function () {
            return S;
          }, set: function (v) {
            S = v;
          }},"");
        S = $impl.XmlTrim(S);
        throw pas.SysUtils.Exception.$create("Create$1",['This puzzle needs the external figure file "' + S + '". Load the complete puzzle folder or provide the referenced figure XML.']);
        if (Result) {
          LoadFigure(XmlDoc.GetDocumentElement());
        };
        return Result;
      };
      function ExecMacro(XmlNode) {
        var i = 0;
        var k = 0;
        var n = 0;
        var SpacePos = 0;
        var MacroName = "";
        var MacroText = "";
        var AttrName = "";
        MacroText = $impl.XmlTrim(XmlNode.GetAttribute("MacroName"));
        n = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Repeat",1);
        for (var $l = 0, $end = XmlNode.GetAttributes().Length() - 1; $l <= $end; $l++) {
          i = $l;
          AttrName = XmlNode.GetAttributes().GetItem(i).GetNodeName();
          if ((AttrName !== "MacroName") && (AttrName !== "Repeat")) pas.uScript.ExecuteScript(AttrName + ":=" + XmlNode.GetAttribute(AttrName));
        };
        for (var $l1 = 0, $end1 = n - 1; $l1 <= $end1; $l1++) {
          k = $l1;
          while (MacroText !== "") {
            MacroText = $impl.XmlTrim(MacroText);
            if (MacroText === "") break;
            SpacePos = pas.System.Pos(" ",MacroText);
            if (SpacePos > 0) {
              MacroName = pas.System.Copy(MacroText,1,SpacePos - 1);
              pas.System.Delete({get: function () {
                  return MacroText;
                }, set: function (v) {
                  MacroText = v;
                }},1,SpacePos);
            } else {
              MacroName = MacroText;
              MacroText = "";
            };
            for (var $l2 = $Self.lMacros.FLength - 1; $l2 >= 0; $l2--) {
              i = $l2;
              XmlNode = $Self.lMacros.GetItem(i);
              if ($impl.XmlSameText(MacroName,$impl.XmlTrim(XmlNode.GetAttribute("Name")))) {
                LoadFigure(XmlNode);
                break;
              };
            };
          };
        };
      };
      function Connect(XmlNode) {
        function ParseInt(S) {
          var Result = 0;
          Result = $impl.XmlStrToIntDef($impl.XmlTrim(pas.uUtils.TUtils.Parse(S,";")),-1);
          return Result;
        };
        var AxisNo = 0;
        var Layer1 = 0;
        var Layer2 = 0;
        var i = 0;
        var SLayers = "";
        AxisNo = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Axis",-1);
        SLayers = XmlNode.GetAttribute("Layers");
        Layer1 = ParseInt({get: function () {
            return SLayers;
          }, set: function (v) {
            SLayers = v;
          }});
        Layer2 = ParseInt({get: function () {
            return SLayers;
          }, set: function (v) {
            SLayers = v;
          }});
        while ((Layer1 !== -1) && (Layer2 !== -1)) {
          if (AxisNo >= 0) {
            Puzzle.FAxes.GetItem(AxisNo).ConnectLayers(Layer1,Layer2)}
           else for (var $l = 0, $end = Puzzle.FAxes.FLength - 1; $l <= $end; $l++) {
            i = $l;
            Puzzle.FAxes.GetItem(i).ConnectLayers(Layer1,Layer2);
          };
          Layer1 = Layer2;
          Layer2 = ParseInt({get: function () {
              return SLayers;
            }, set: function (v) {
              SLayers = v;
            }});
        };
      };
      function LoadFigure(XmlNode) {
        var i = 0;
        var XmlSubNode = null;
        var S = "";
        var Script = "";
        var Part = null;
        var SolvedState = null;
        for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
          i = $l;
          XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
          S = XmlSubNode.GetNodeName();
          if (S === "LoadFrom") {
            LoadFrom(XmlSubNode);
          } else if (S === "Part") {
            Part = pas.uPart.TPart.$create("Create$1");
            if ($Self.PartLoadFromXml(Part,XmlSubNode)) {
              Puzzle.FParts.Add(Part);
              Puzzle.PositionsInvalidate();
            } else Part = rtl.freeLoc(Part);
          } else if (S === "Macro") {
            $Self.lMacros.Add(XmlSubNode)}
           else if (S === "ExecMacro") {
            ExecMacro(XmlSubNode);
          } else if (S === "Circle") {
            Part = pas.uPart.TPart.$create("Create$1");
            if ($Self.PartLoadCircle(Part,XmlSubNode)) {
              Puzzle.FParts.Add(Part);
              Puzzle.PositionsInvalidate();
            } else Part = rtl.freeLoc(Part);
          } else if (S === "Cylinder") {
            Part = pas.uPart.TPart.$create("Create$1");
            if ($Self.PartLoadCylinder(Part,XmlSubNode)) {
              Puzzle.FParts.Add(Part);
              Puzzle.PositionsInvalidate();
            } else Part = rtl.freeLoc(Part);
          } else if (S === "Script") {
            pas.uXmlUtils.ReadStringFromXml(XmlSubNode,"",{get: function () {
                return Script;
              }, set: function (v) {
                Script = v;
              }},"");
            pas.uScript.ExecuteScript(Script);
          } else if (S === "SplitByAxes") {
            pas.uPuzzleUtils.TPuzzleUtils.SplitByAxes(Puzzle)}
           else if (S === "Split") {
            Split(XmlSubNode)}
           else if (S === "Cut") {
            Cut(XmlSubNode)}
           else if (S === "Transfer") {
            $Self.Transfer(Puzzle,XmlSubNode)}
           else if (S === "Turn") {
            $Self.Turn(Puzzle,XmlSubNode)}
           else if (S === "Undo") {
            UndoRepeat(XmlSubNode)}
           else if (S === "Hide") {
            Hide(XmlSubNode)}
           else if (S === "HideAll") {
            pas.uPuzzleUtils.TPuzzleUtils.SetAllInvisible(Puzzle)}
           else if (S === "HideContaining") {
            HideContaining(XmlSubNode)}
           else if (S === "SetSpike") {
            SetSpike(XmlSubNode)}
           else if (S === "ShowAll") {
            pas.uPuzzleUtils.TPuzzleUtils.SetAllVisible(Puzzle)}
           else if (S === "InvertVisibility") {
            pas.uPuzzleUtils.TPuzzleUtils.InvertVisibility(Puzzle)}
           else if (S === "RemoveAllVisible") {
            RemoveAllVisible()}
           else if (S === "RemoveGrayParts") {
            pas.uPuzzleUtils.TPuzzleUtils.RemoveGrayParts(Puzzle)}
           else if (S === "RemoveContaining") {
            RemoveContaining(XmlSubNode)}
           else if (S === "Connect") {
            Connect(XmlSubNode)}
           else if (S === "SaveSolvedState") {
            SolvedState = pas.uSolvedState.TSolvedState.$create("Create$1");
            SolvedState.CalcFromPuzzle(Puzzle);
            Puzzle.FSolvedStates.FSolvedStates.Add(SolvedState);
          };
        };
      };
      function LoadGraphicsOptions(XmlNode) {
      };
      var i = 0;
      var S = "";
      var XmlSubNode = null;
      Result = false;
      $mod.TXmlReadWrite.lMacros = pas["Generics.Collections"].TList$G19.$create("Create$1");
      try {
        if (!this.PuzzleLoadHeaderFromXml(Puzzle,XmlNode)) return Result;
        Puzzle.BeforeLoadFromXmlEvent(XmlNode);
        for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
          i = $l;
          XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
          S = XmlSubNode.GetNodeName();
          if (S === "Script") {
            pas.uScript.ExecuteScript(pas.uXmlUtils.DomValueToString(XmlSubNode.GetTextContent()))}
           else if (S === "Axes") {
            this.AxesLoadFromXml(Puzzle.FAxes,XmlSubNode)}
           else if (S === "Figure") {
            LoadFigure(XmlSubNode)}
           else if (S === "Macros") {
            this.MacrosLoadFromXml(Puzzle.Macros,XmlSubNode)}
           else if (S === "Procedures") {
            LoadProcedures(XmlSubNode)}
           else if (S === "GraphicsOptions") {
            LoadGraphicsOptions(XmlSubNode)}
           else if (S === "Textures") {
            LoadTextures(XmlSubNode)}
           else if (S === "SetTextures") {
            SetTextures(XmlSubNode)}
           else if (S === "Undo") this.TurnsLoadFromXml(Puzzle,Puzzle.UndoStack,XmlSubNode);
        };
        Puzzle.AfterLoadFromXmlEvent(XmlNode);
      } finally {
        rtl.free(this,"lMacros");
        $mod.TXmlReadWrite.lMacros = null;
      };
      Result = true;
      return Result;
    };
    this.MacroLoadFromXml = function (Macro, XmlNode) {
      var Result = false;
      Macro.Name = XmlNode.GetAttribute("Name");
      Macro.Description = XmlNode.GetAttribute("Description");
      Macro.Sequence = XmlNode.GetAttribute("Sequence");
      Result = true;
      return Result;
    };
    this.MacrosLoadFromXml = function (Macros, XmlNode) {
      var Result = false;
      var i = 0;
      var Macro = null;
      var XmlSubNode = null;
      var S = "";
      for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
        i = $l;
        XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
        S = XmlSubNode.GetNodeName();
        if (S === "Macro") {
          Macro = pas.uMacro.TMacro.$create("Create");
          if (this.MacroLoadFromXml(Macro,XmlSubNode) && (XmlSubNode.GetAttribute("Public") === "1")) {
            Macros.Add(Macro)}
           else Macro = rtl.freeLoc(Macro);
        };
      };
      Result = true;
      return Result;
    };
    this.TextureLoadFromXml = function (Texture, XmlNode) {
      var Result = false;
      Texture.Name = $impl.XmlTrim(XmlNode.GetAttribute("Name"));
      Texture.FileName = $impl.XmlTrim(XmlNode.GetAttribute("File"));
      Result = true;
      return Result;
    };
    this.TurnLoadFromXml = function (Puzzle, Turn, XmlNode) {
      var Result = false;
      var S = "";
      Turn.AxisNo = pas.uXmlUtils.ReadIntExpressionFromXml(XmlNode,"Axis",0);
      Turn.Layers = rtl.arraySetLength(Turn.Layers,false,Puzzle.FAxes.GetItem(Turn.AxisNo).Layers.FLength);
      S = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"Layers");
      this.DecodeLayers(S,{p: Turn, get: function () {
          return this.p.Layers;
        }, set: function (v) {
          this.p.Layers = v;
        }});
      S = pas.uXmlUtils.ReadStringFromXml$2(XmlNode,"type");
      if ((S === "") || $impl.XmlSameText(S,"LayerTurn")) {
        Turn.typ = pas.uTurn.TTurningType.ttyLayerTurn;
        Turn.Angle = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"Angle");
      } else if ($impl.XmlSameText(S,"PartsMove")) {
        Turn.typ = pas.uTurn.TTurningType.ttyPartsMove;
        Turn.Distance = pas.uXmlUtils.ReadDoubleExpressionFromXml(XmlNode,"Distance");
      } else Turn.typ = pas.uTurn.TTurningType.ttyNone;
      Result = true;
      return Result;
    };
    this.TurnsLoadFromXml = function (Puzzle, Turns, XmlNode) {
      var Result = false;
      var i = 0;
      var Turn = null;
      var XmlSubNode = null;
      Result = false;
      for (var $l = 0, $end = XmlNode.GetChildNodes().Count() - 1; $l <= $end; $l++) {
        i = $l;
        XmlSubNode = XmlNode.GetChildNodes().GetItem(i);
        if ($impl.XmlSameText(XmlSubNode.GetNodeName(),"Turn")) {
          Turn = pas.uTurn.TTurn.$create("Create");
          if (!this.TurnLoadFromXml(Puzzle,Turn,XmlSubNode)) {
            Turn = rtl.freeLoc(Turn);
            return Result;
          };
          Turns.Add(Turn);
        };
      };
      Result = true;
      return Result;
    };
  });
  $mod.$implcode = function () {
    $impl.XmlUpperCase = function (S) {
      var Result = "";
      var I = 0;
      var C = 0;
      Result = S;
      for (var $l = 1, $end = Result.length; $l <= $end; $l++) {
        I = $l;
        C = Result.charCodeAt(I - 1);
        if ((C >= 97) && (C <= 122)) Result = rtl.setCharAt(Result,I - 1,String.fromCharCode(C - 32));
      };
      return Result;
    };
    $impl.XmlSameText = function (A, B) {
      var Result = false;
      Result = $impl.XmlUpperCase(A) === $impl.XmlUpperCase(B);
      return Result;
    };
    $impl.XmlStrToIntDef = function (S, Default) {
      var Result = 0;
      var I = 0;
      var Sign = 0;
      var N = 0;
      if (S === "") return Default;
      I = 1;
      Sign = 1;
      if (S.charAt(0) === "-") {
        Sign = -1;
        I = 2;
      };
      if (I > S.length) return Default;
      N = 0;
      while (I <= S.length) {
        if ((S.charAt(I - 1) < "0") || (S.charAt(I - 1) > "9")) return Default;
        N = ((N * 10) + S.charCodeAt(I - 1)) - 48;
        I += 1;
      };
      Result = N * Sign;
      return Result;
    };
    $impl.XmlStrToInt = function (S) {
      var Result = 0;
      var I = 0;
      var Sign = 0;
      var N = 0;
      Result = 0;
      I = 1;
      Sign = 1;
      if ((S.length > 0) && (S.charAt(0) === "-")) {
        Sign = -1;
        I = 2;
      };
      while (I <= S.length) {
        N = S.charCodeAt(I - 1) - 48;
        if ((N < 0) || (N > 9)) return 0;
        Result = (Result * 10) + N;
        I += 1;
      };
      Result = Result * Sign;
      return Result;
    };
    $impl.XmlIntToStr = function (Value) {
      var Result = "";
      var N = 0;
      if (Value === 0) return "0";
      N = Value;
      Result = "";
      while (N > 0) {
        Result = String.fromCharCode(48 + (N % 10)) + Result;
        N = rtl.trunc(N / 10);
      };
      return Result;
    };
    $impl.XmlTrim = function (S) {
      var Result = "";
      var First = 0;
      var Last = 0;
      First = 1;
      Last = S.length;
      while ((First <= Last) && (S.charAt(First - 1) <= " ")) First += 1;
      while ((Last >= First) && (S.charAt(Last - 1) <= " ")) Last -= 1;
      Result = pas.System.Copy(S,First,(Last - First) + 1);
      return Result;
    };
    $impl.CIRCLE_SECTORS = 64;
  };
},["uScript","uUtils","uXmlUtils","uMatrix","uSolvedState","uPuzzleUtils","uSelection","uGeometryUtils","JS","Variants","SysUtils","strutils","Classes","Math"]);
rtl.module("program",["System","JS","Web","SysUtils","Math","DOM","uPuzzle","uXmlReadWrite","uPart","uFace","uVector","uAxis","uSelection"],function () {
  "use strict";
  var $mod = this;
  this.StatusNode = null;
  this.API = null;
  this.CurrentPuzzle = null;
  this.OriginalXmlRoot = null;
  this.SetStatus = function (S) {
    $mod.StatusNode = document.getElementById("engine-status");
    if ($mod.StatusNode !== null) $mod.StatusNode.textContent = S;
  };
  this.APIGetStatus = function () {
    var Result = "";
    if ($mod.CurrentPuzzle === null) {
      Result = "Pascal bridge online; puzzle model unavailable"}
     else if (($mod.CurrentPuzzle.FAxes.FLength === 0) || ($mod.CurrentPuzzle.FParts.FLength === 0)) {
      Result = "Pascal puzzle model connected; no puzzle loaded"}
     else Result = "Pascal puzzle model loaded (" + pas.SysUtils.IntToStr($mod.CurrentPuzzle.FParts.FLength) + " parts, " + pas.SysUtils.IntToStr($mod.CurrentPuzzle.FAxes.FLength) + " axes)";
    return Result;
  };
  this.APIGetVersion = function () {
    var Result = "";
    Result = "0.3.1";
    return Result;
  };
  this.APIIsPuzzleReady = function () {
    var Result = false;
    Result = ($mod.CurrentPuzzle !== null) && ($mod.CurrentPuzzle.FAxes.FLength > 0) && ($mod.CurrentPuzzle.FParts.FLength > 0);
    return Result;
  };
  this.APIGetModelInfo = function () {
    var Result = null;
    Result = pas.JS.New([]);
    Result["connected"] = $mod.CurrentPuzzle !== null;
    Result["ready"] = $mod.APIIsPuzzleReady();
    if ($mod.CurrentPuzzle !== null) {
      Result["parts"] = $mod.CurrentPuzzle.FParts.FLength;
      Result["axes"] = $mod.CurrentPuzzle.FAxes.FLength;
      Result["undoCount"] = $mod.CurrentPuzzle.GetUndoCount();
      Result["redoCount"] = $mod.CurrentPuzzle.RedoStack.FLength;
      Result["name"] = $mod.CurrentPuzzle.Header.Name;
    } else {
      Result["parts"] = 0;
      Result["axes"] = 0;
      Result["undoCount"] = 0;
      Result["redoCount"] = 0;
      Result["name"] = "";
    };
    return Result;
  };
  this.APIGetAxesInfo = function () {
    var Result = null;
    var I = 0;
    var J = 0;
    var AxisInfo = null;
    var Angles = null;
    var FixedLayers = null;
    Result = new Array();
    if ($mod.CurrentPuzzle === null) return Result;
    for (var $l = 0, $end = $mod.CurrentPuzzle.FAxes.FLength - 1; $l <= $end; $l++) {
      I = $l;
      if ((Math.abs($mod.CurrentPuzzle.FAxes.GetItem(I).GetNormVector().x) + Math.abs($mod.CurrentPuzzle.FAxes.GetItem(I).GetNormVector().y) + Math.abs($mod.CurrentPuzzle.FAxes.GetItem(I).GetNormVector().z)) < 0.0001) continue;
      AxisInfo = new Object();
      AxisInfo["index"] = I;
      AxisInfo["layers"] = $mod.CurrentPuzzle.FAxes.GetItem(I).Layers.FLength;
      AxisInfo["x"] = $mod.CurrentPuzzle.FAxes.GetItem(I).GetNormVector().x;
      AxisInfo["y"] = $mod.CurrentPuzzle.FAxes.GetItem(I).GetNormVector().y;
      AxisInfo["z"] = $mod.CurrentPuzzle.FAxes.GetItem(I).GetNormVector().z;
      AxisInfo["enabled"] = $mod.CurrentPuzzle.FAxes.GetItem(I).Enabled;
      AxisInfo["layerCount"] = $mod.CurrentPuzzle.FAxes.GetItem(I).Layers.FLength;
      Angles = new Array();
      FixedLayers = new Array();
      for (var $l1 = 0, $end1 = $mod.CurrentPuzzle.FAxes.GetItem(I).Layers.FLength - 1; $l1 <= $end1; $l1++) {
        J = $l1;
        Angles.push($mod.CurrentPuzzle.FAxes.GetItem(I).Layers.GetItem(J).FTurningAngle);
        FixedLayers.push($mod.CurrentPuzzle.FAxes.GetItem(I).Layers.GetItem(J).Fixed);
      };
      AxisInfo["angles"] = Angles;
      AxisInfo["fixedLayers"] = FixedLayers;
      if ($mod.CurrentPuzzle.FAxes.GetItem(I).Layers.FLength > 0) AxisInfo["angle"] = $mod.CurrentPuzzle.FAxes.GetItem(I).Layers.GetItem(0).FTurningAngle;
      Result.push(AxisInfo);
    };
    return Result;
  };
  this.APITurnLayer = function (AxisNo, LayerNo, Direction) {
    var Result = false;
    var BeforeCount = 0;
    var Angle = 0.0;
    Result = false;
    if (!$mod.APIIsPuzzleReady()) return Result;
    if ((AxisNo < 0) || (AxisNo >= $mod.CurrentPuzzle.FAxes.FLength)) return Result;
    if ((LayerNo < 0) || (LayerNo >= $mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.FLength)) return Result;
    if ((Direction !== -1) && (Direction !== 1)) return Result;
    if (!$mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Enabled) return Result;
    if ($mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.GetItem(LayerNo).Fixed) return Result;
    Angle = $mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.GetItem(LayerNo).FTurningAngle;
    if (Math.abs(Angle) < 0.000001) return Result;
    BeforeCount = $mod.CurrentPuzzle.GetUndoCount();
    $mod.CurrentPuzzle.RotateLayer(AxisNo,LayerNo,Angle * Direction,true);
    Result = $mod.CurrentPuzzle.GetUndoCount() > BeforeCount;
    if (Result) $mod.CurrentPuzzle.PositionsInvalidate();
    return Result;
  };
  this.APIScramble = function () {
    var Result = false;
    var I = 0;
    var AxisNo = 0;
    var LayerNo = 0;
    var Direction = 0;
    var Turns = 0;
    var BeforeCount = 0;
    var PreviousAxis = 0;
    var PreviousLayer = 0;
    var PreviousDirection = 0;
    var Angle = 0.0;
    var Attempts = 0;
    Result = false;
    if (!$mod.APIIsPuzzleReady()) {
      $mod.SetStatus("Scramble unavailable: load a valid puzzle XML first.");
      return Result;
    };
    Turns = 0;
    PreviousAxis = -1;
    PreviousLayer = -1;
    PreviousDirection = 0;
    for (I = 1; I <= 30; I++) {
      Attempts = 0;
      do {
        Attempts += 1;
        AxisNo = pas.System.Random($mod.CurrentPuzzle.FAxes.FLength);
        if ($mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.FLength === 0) continue;
        LayerNo = pas.System.Random($mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.FLength);
        Direction = (pas.System.Random(2) * 2) - 1;
        if ((AxisNo === PreviousAxis) && (LayerNo === PreviousLayer) && (Direction === -PreviousDirection)) continue;
        break;
      } while (!(Attempts >= 100));
      if (Attempts >= 100) continue;
      if ((Math.abs($mod.CurrentPuzzle.FAxes.GetItem(AxisNo).GetNormVector().x) + Math.abs($mod.CurrentPuzzle.FAxes.GetItem(AxisNo).GetNormVector().y) + Math.abs($mod.CurrentPuzzle.FAxes.GetItem(AxisNo).GetNormVector().z)) < 0.0001) continue;
      if (!$mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Enabled) continue;
      if ($mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.GetItem(LayerNo).Fixed) continue;
      Angle = $mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.GetItem(LayerNo).FTurningAngle;
      if (Math.abs(Angle) < 0.000001) continue;
      BeforeCount = $mod.CurrentPuzzle.GetUndoCount();
      $mod.CurrentPuzzle.RotateLayer(AxisNo,LayerNo,Angle * Direction,true);
      if ($mod.CurrentPuzzle.GetUndoCount() > BeforeCount) {
        Turns += 1;
        PreviousAxis = AxisNo;
        PreviousLayer = LayerNo;
        PreviousDirection = Direction;
      };
    };
    Result = Turns > 0;
    if (Result) {
      $mod.SetStatus("Scrambled: " + pas.SysUtils.IntToStr(Turns) + " layer moves.")}
     else $mod.SetStatus("Scramble failed: this puzzle has no movable layers.");
    return Result;
  };
  this.APIGetRenderData = function () {
    var Result = null;
    var FacesArray = null;
    var VerticesArray = null;
    var VertexArray = null;
    var FaceObject = null;
    var Part = null;
    var Face = null;
    var V = pas.uVector.TVector.$new();
    var I = 0;
    var PartIndex = 0;
    Result = pas.JS.New([]);
    FacesArray = new Array();
    PartIndex = 0;
    if ($mod.CurrentPuzzle !== null) {
      var $in = $mod.CurrentPuzzle.FParts.GetEnumerator$1();
      try {
        while ($in.MoveNext()) {
          Part = $in.DoGetCurrent();
          if (Part.FVisible) {
            var $in1 = Part.FFaces.GetEnumerator$1();
            try {
              while ($in1.MoveNext()) {
                Face = $in1.DoGetCurrent();
                if (Face.GetVertexCount() >= 3) {
                  FaceObject = new Object();
                  VerticesArray = new Array();
                  for (var $l = 0, $end = Face.GetVertexCount() - 1; $l <= $end; $l++) {
                    I = $l;
                    V.$assign(Face.GetVertex(I));
                    VertexArray = new Array();
                    VertexArray.push(V.x);
                    VertexArray.push(V.y);
                    VertexArray.push(V.z);
                    VerticesArray.push(VertexArray);
                  };
                  FaceObject["vertices"] = VerticesArray;
                  FaceObject["color"] = Face.Color;
                  FaceObject["partIndex"] = PartIndex;
                  FacesArray.push(FaceObject);
                };
              }
            } finally {
              $in1 = rtl.freeLoc($in1)
            };
          };
          PartIndex += 1;
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    Result["faces"] = FacesArray;
    return Result;
  };
  this.APIGetMovingPartMask = function (AxisNo, LayerNo) {
    var Result = null;
    var I = 0;
    var J = 0;
    var FromLayer = 0;
    var ToLayer = 0;
    var Selected = false;
    Result = new Array();
    if (($mod.CurrentPuzzle === null) || (AxisNo < 0) || (AxisNo >= $mod.CurrentPuzzle.FAxes.FLength) || (LayerNo < 0) || (LayerNo >= $mod.CurrentPuzzle.FAxes.GetItem(AxisNo).Layers.FLength)) return Result;
    $mod.CurrentPuzzle.CalcMovingLayers$1(AxisNo,LayerNo,1);
    for (var $l = 0, $end = $mod.CurrentPuzzle.FParts.FLength - 1; $l <= $end; $l++) {
      I = $l;
      $mod.CurrentPuzzle.GetPartPosition(AxisNo,I,{get: function () {
          return FromLayer;
        }, set: function (v) {
          FromLayer = v;
        }},{get: function () {
          return ToLayer;
        }, set: function (v) {
          ToLayer = v;
        }});
      Selected = false;
      for (var $l1 = FromLayer, $end1 = ToLayer; $l1 <= $end1; $l1++) {
        J = $l1;
        if ((J >= 0) && (J < rtl.length(pas.uSelection.TSelection.TurnLayers)) && pas.uSelection.TSelection.TurnLayers[J]) {
          Selected = true;
          break;
        };
      };
      Result.push(Selected);
    };
    return Result;
  };
  this.APIGetPartLayerRanges = function (AxisNo) {
    var Result = null;
    var I = 0;
    var FromLayer = 0;
    var ToLayer = 0;
    var Range = null;
    Result = new Array();
    if (($mod.CurrentPuzzle === null) || (AxisNo < 0) || (AxisNo >= $mod.CurrentPuzzle.FAxes.FLength)) return Result;
    for (var $l = 0, $end = $mod.CurrentPuzzle.FParts.FLength - 1; $l <= $end; $l++) {
      I = $l;
      $mod.CurrentPuzzle.GetPartPosition(AxisNo,I,{get: function () {
          return FromLayer;
        }, set: function (v) {
          FromLayer = v;
        }},{get: function () {
          return ToLayer;
        }, set: function (v) {
          ToLayer = v;
        }});
      Range = new Array();
      Range.push(FromLayer);
      Range.push(ToLayer);
      Result.push(Range);
    };
    return Result;
  };
  this.APIGetPartCenters = function () {
    var Result = null;
    var Part = null;
    var I = 0;
    var Center = null;
    var X = 0.0;
    var Y = 0.0;
    var Z = 0.0;
    Result = new Array();
    if ($mod.CurrentPuzzle === null) return Result;
    var $in = $mod.CurrentPuzzle.FParts.GetEnumerator$1();
    try {
      while ($in.MoveNext()) {
        Part = $in.DoGetCurrent();
        if (Part.FVertices.FLength === 0) {
          Center = new Array();
          Result.push(Center);
          continue;
        };
        X = 0;
        Y = 0;
        Z = 0;
        for (var $l = 0, $end = Part.FVertices.FLength - 1; $l <= $end; $l++) {
          I = $l;
          X = X + Part.FVertices.GetItem(I).x;
          Y = Y + Part.FVertices.GetItem(I).y;
          Z = Z + Part.FVertices.GetItem(I).z;
        };
        Center = new Array();
        Center.push(X / Part.FVertices.FLength);
        Center.push(Y / Part.FVertices.FLength);
        Center.push(Z / Part.FVertices.FLength);
        Result.push(Center);
      }
    } finally {
      $in = rtl.freeLoc($in)
    };
    return Result;
  };
  this.APIUndo = function () {
    if ($mod.APIIsPuzzleReady() && $mod.CurrentPuzzle.Undo(false)) {
      $mod.SetStatus("Undo performed by Pascal TPuzzle.")}
     else $mod.SetStatus("Nothing to undo.");
  };
  this.APIRedo = function () {
    if ($mod.APIIsPuzzleReady() && $mod.CurrentPuzzle.Redo(false)) {
      $mod.SetStatus("Redo performed by Pascal TPuzzle.")}
     else $mod.SetStatus("Nothing to redo.");
  };
  this.APIReset = function () {
    if ($mod.OriginalXmlRoot === null) {
      $mod.SetStatus("Reset unavailable: no original puzzle XML has been loaded.");
      return;
    };
    if ($mod.APILoadXML($mod.OriginalXmlRoot)) $mod.SetStatus("Puzzle reset to its original XML state.");
  };
  this.APIOpenLibrary = function () {
    $mod.SetStatus("Choose a puzzle XML file to load a puzzle.");
  };
  this.APILoadXML = function (XmlRoot) {
    var Result = false;
    var NewPuzzle = null;
    Result = false;
    if (XmlRoot === null) {
      $mod.SetStatus("XML load failed: no XML root element was supplied.");
      return Result;
    };
    NewPuzzle = pas.uPuzzle.TPuzzle.$create("Create$1");
    try {
      NewPuzzle.DisableAnimation();
      if (!pas.uXmlReadWrite.TXmlReadWrite.PuzzleLoadFromXml(NewPuzzle,pas.DOM.WrapDomNode(XmlRoot))) {
        $mod.SetStatus("XML load failed: pCubes rejected the puzzle definition.");
        return Result;
      };
      if ((NewPuzzle.FParts.FLength === 0) || (NewPuzzle.FAxes.FLength === 0)) {
        $mod.SetStatus("XML load failed: the file contains no usable puzzle parts or axes.");
        return Result;
      };
      if ($mod.CurrentPuzzle !== null) rtl.free($mod,"CurrentPuzzle");
      $mod.CurrentPuzzle = NewPuzzle;
      $mod.OriginalXmlRoot = XmlRoot;
      NewPuzzle = null;
      $mod.SetStatus('Loaded "' + $mod.CurrentPuzzle.Header.Name + '" from XML (' + pas.SysUtils.IntToStr($mod.CurrentPuzzle.FParts.FLength) + " parts, " + pas.SysUtils.IntToStr($mod.CurrentPuzzle.FAxes.FLength) + " axes).");
      Result = true;
    } catch ($e) {
      if (pas.SysUtils.Exception.isPrototypeOf($e)) {
        var E = $e;
        $mod.SetStatus("XML load failed (" + E.$classname + "): " + E.fMessage);
      } else throw $e
    };
    if (NewPuzzle !== null) NewPuzzle = rtl.freeLoc(NewPuzzle);
    return Result;
  };
  this.InstallBrowserAPI = function () {
    $mod.API = pas.JS.New([]);
    $mod.API["version"] = "0.3.1";
    $mod.API["getStatus"] = $mod.APIGetStatus;
    $mod.API["getVersion"] = $mod.APIGetVersion;
    $mod.API["isPuzzleReady"] = $mod.APIIsPuzzleReady;
    $mod.API["getModelInfo"] = $mod.APIGetModelInfo;
    $mod.API["getRenderData"] = $mod.APIGetRenderData;
    $mod.API["getPartCenters"] = $mod.APIGetPartCenters;
    $mod.API["getPartLayerRanges"] = $mod.APIGetPartLayerRanges;
    $mod.API["getMovingPartMask"] = $mod.APIGetMovingPartMask;
    $mod.API["getAxesInfo"] = $mod.APIGetAxesInfo;
    $mod.API["turnLayer"] = $mod.APITurnLayer;
    $mod.API["scramble"] = $mod.APIScramble;
    $mod.API["undo"] = $mod.APIUndo;
    $mod.API["redo"] = $mod.APIRedo;
    $mod.API["reset"] = $mod.APIReset;
    $mod.API["openLibrary"] = $mod.APIOpenLibrary;
    $mod.API["loadXML"] = $mod.APILoadXML;
    window["pCubes"] = $mod.API;
  };
  $mod.$main = function () {
    $mod.CurrentPuzzle = pas.uPuzzle.TPuzzle.$create("Create$1");
    $mod.OriginalXmlRoot = null;
    $mod.CurrentPuzzle.DisableAnimation();
    $mod.InstallBrowserAPI();
    $mod.SetStatus("Pascal TPuzzle model instantiated. Load a puzzle definition to begin.");
  };
});
