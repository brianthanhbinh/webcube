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
  rtl.recNewT($mod,"TGuid",function () {
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
  rtl.createClass($mod,"TObject",null,function () {
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
  rtl.createInterface($mod,"IUnknown","{00000000-0000-0000-C000-000000000046}",["QueryInterface","_AddRef","_Release"],null,function () {
    this.$kind = "com";
    var $r = this.$rtti;
    $r.addMethod("QueryInterface",1,[["iid",$mod.$rtti["TGuid"],2],["obj",null,4]],rtl.longint);
    $r.addMethod("_AddRef",1,null,rtl.longint);
    $r.addMethod("_Release",1,null,rtl.longint);
  });
  this.Random = function (Range) {
    return Math.floor(Math.random()*Range);
  };
  this.Sqr$1 = function (A) {
    return A*A;
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
  $mod.$init = function () {
    rtl.exitcode = 0;
  };
},null,function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.WriteBuf = "";
  $impl.WriteCallBack = null;
});
rtl.module("Types",["System"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("JS",["System","Types"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass($mod,"EJS",pas.System.TObject,function () {
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
});
rtl.module("weborworker",["System","JS","Types"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("Web",["System","Types","JS","weborworker"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("SysUtils",["System","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass($mod,"Exception",pas.System.TObject,function () {
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
  });
  rtl.createClass($mod,"EArgumentException",$mod.Exception,function () {
  });
  rtl.createClass($mod,"EArgumentOutOfRangeException",$mod.EArgumentException,function () {
  });
  this.Trim = function (S) {
    return S.replace(/^[\s\uFEFF\xA0\x00-\x1f]+/,'').replace(/[\s\uFEFF\xA0\x00-\x1f]+$/,'');
  };
  this.IntToStr = function (Value) {
    var Result = "";
    Result = "" + Value;
    return Result;
  };
  this.ShortMonthNames = rtl.arraySetLength(null,"",12);
  this.LongMonthNames = rtl.arraySetLength(null,"",12);
  this.ShortDayNames = rtl.arraySetLength(null,"",7);
  this.LongDayNames = rtl.arraySetLength(null,"",7);
  $mod.$init = function () {
    $mod.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
    $mod.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
    $mod.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
    $mod.LongDayNames = $impl.DefaultLongDayNames.slice(0);
  };
},null,function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.DefaultShortMonthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  $impl.DefaultLongMonthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  $impl.DefaultShortDayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  $impl.DefaultLongDayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
});
rtl.module("Classes",["System","Types","SysUtils","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $mod.$init = function () {
    $impl.ClassList = new Object();
  };
},[],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.ClassList = null;
});
rtl.module("Generics.Strings",["System"],function () {
  "use strict";
  var $mod = this;
  $mod.$resourcestrings = {SArgumentOutOfRange: {org: "Argument out of range"}};
});
rtl.module("Generics.Defaults",["System"],function () {
  "use strict";
  var $mod = this;
  rtl.createInterface($mod,"IComparer$G25","{505778ED-F783-4456-9691-32F419CC5E18}",["Compare"],pas.System.IUnknown);
});
rtl.module("Generics.Collections",["System","Classes","SysUtils","Types","JS","Generics.Strings","Generics.Defaults"],function () {
  "use strict";
  var $mod = this;
  $mod.$rtti.$Class("TEnumerator$G19");
  $mod.$rtti.$Class("TEnumerable$G18");
  $mod.$rtti.$Class("TCustomList$G11");
  $mod.$rtti.$Class("TCustomListEnumerator$G9");
  $mod.$rtti.$Class("TList$G4");
  $mod.$rtti.$Class("TEnumerator$G20");
  $mod.$rtti.$Class("TEnumerable$G19");
  $mod.$rtti.$Class("TCustomList$G12");
  $mod.$rtti.$Class("TCustomListEnumerator$G10");
  $mod.$rtti.$Class("TList$G5");
  $mod.$rtti.$Class("TEnumerable$G20");
  $mod.$rtti.$Class("TCustomList$G13");
  $mod.$rtti.$Class("TList$G6");
  $mod.$rtti.$Class("TEnumerable$G21");
  $mod.$rtti.$Class("TCustomList$G14");
  $mod.$rtti.$Class("TList$G7");
  $mod.$rtti.$Class("TEnumerator$G23");
  $mod.$rtti.$Class("TEnumerable$G22");
  $mod.$rtti.$Class("TCustomList$G15");
  $mod.$rtti.$Class("TCustomListEnumerator$G13");
  $mod.$rtti.$Class("TList$G8");
  $mod.$rtti.$Class("TEnumerator$G25");
  $mod.$rtti.$Class("TEnumerable$G24");
  $mod.$rtti.$Class("TCustomList$G17");
  $mod.$rtti.$Class("TCustomListEnumerator$G15");
  $mod.$rtti.$Class("TList$G10");
  $mod.$rtti.$Class("TEnumerator$G26");
  $mod.$rtti.$Class("TEnumerable$G25");
  $mod.$rtti.$Class("TCustomList$G18");
  $mod.$rtti.$Class("TCustomListEnumerator$G16");
  $mod.$rtti.$Class("TList$G11");
  $mod.$rtti.$Class("TEnumerator$G27");
  $mod.$rtti.$Class("TEnumerable$G26");
  $mod.$rtti.$Class("TCustomList$G19");
  $mod.$rtti.$Class("TCustomListEnumerator$G17");
  $mod.$rtti.$Class("TList$G12");
  $mod.$rtti.$Class("TEnumerable$G27");
  $mod.$rtti.$Class("TCustomList$G20");
  $mod.$rtti.$Class("TList$G13");
  $mod.$rtti.$Class("TEnumerable$G28");
  $mod.$rtti.$Class("TCustomList$G21");
  $mod.$rtti.$Class("TList$G14");
  $mod.$rtti.$Class("TEnumerable$G29");
  $mod.$rtti.$Class("TCustomList$G22");
  $mod.$rtti.$Class("TList$G15");
  $mod.$rtti.$Class("TEnumerable$G30");
  $mod.$rtti.$Class("TCustomList$G23");
  $mod.$rtti.$Class("TList$G16");
  $mod.$rtti.$Class("TEnumerator$G32");
  $mod.$rtti.$Class("TEnumerable$G31");
  $mod.$rtti.$Class("TCustomList$G24");
  $mod.$rtti.$Class("TCustomListEnumerator$G22");
  $mod.$rtti.$Class("TList$G17");
  this.TCollectionNotification = {"0": "cnAdded", cnAdded: 0, "1": "cnRemoved", cnRemoved: 1, "2": "cnExtracted", cnExtracted: 2};
  rtl.createClass($mod,"TEnumerator$G19",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  });
  rtl.createClass($mod,"TEnumerable$G18",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G11",$mod.TEnumerable$G18,function () {
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
  });
  rtl.createClass($mod,"TCustomListEnumerator$G9",$mod.TEnumerator$G19,function () {
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
  });
  rtl.createClass($mod,"TList$G4",$mod.TCustomList$G11,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G9,function () {
    });
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
  });
  rtl.createClass($mod,"TEnumerator$G20",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  });
  rtl.createClass($mod,"TEnumerable$G19",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G12",$mod.TEnumerable$G19,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TCustomListEnumerator$G10",$mod.TEnumerator$G20,function () {
    this.$init = function () {
      $mod.TEnumerator$G20.$init.call(this);
      this.FList = null;
      this.FIndex = 0;
    };
    this.$final = function () {
      this.FList = undefined;
      $mod.TEnumerator$G20.$final.call(this);
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
  });
  rtl.createClass($mod,"TList$G5",$mod.TCustomList$G12,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G10,function () {
    });
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
  });
  rtl.createClass($mod,"TEnumerable$G20",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G13",$mod.TEnumerable$G20,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TList$G6",$mod.TCustomList$G13,function () {
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
    this.Create$1 = function () {
      this.InitializeList();
      return this;
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
  });
  rtl.createClass($mod,"TEnumerable$G21",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G14",$mod.TEnumerable$G21,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TList$G7",$mod.TCustomList$G14,function () {
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
  });
  rtl.createClass($mod,"TEnumerator$G23",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  });
  rtl.createClass($mod,"TEnumerable$G22",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G15",$mod.TEnumerable$G22,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TCustomListEnumerator$G13",$mod.TEnumerator$G23,function () {
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
  });
  rtl.createClass($mod,"TList$G8",$mod.TCustomList$G15,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G13,function () {
    });
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
  });
  rtl.createClass($mod,"TEnumerator$G25",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  });
  rtl.createClass($mod,"TEnumerable$G24",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G17",$mod.TEnumerable$G24,function () {
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
  });
  rtl.createClass($mod,"TCustomListEnumerator$G15",$mod.TEnumerator$G25,function () {
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
  });
  rtl.createClass($mod,"TList$G10",$mod.TCustomList$G17,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G15,function () {
    });
    this.$init = function () {
      $mod.TCustomList$G17.$init.call(this);
      this.FComparer = null;
    };
    this.$final = function () {
      this.FComparer = undefined;
      $mod.TCustomList$G17.$final.call(this);
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
  });
  rtl.createClass($mod,"TEnumerator$G26",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  });
  rtl.createClass($mod,"TEnumerable$G25",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G18",$mod.TEnumerable$G25,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TCustomListEnumerator$G16",$mod.TEnumerator$G26,function () {
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
  });
  rtl.createClass($mod,"TList$G11",$mod.TCustomList$G18,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G16,function () {
    });
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
  });
  rtl.createClass($mod,"TEnumerator$G27",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  });
  rtl.createClass($mod,"TEnumerable$G26",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G19",$mod.TEnumerable$G26,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TCustomListEnumerator$G17",$mod.TEnumerator$G27,function () {
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
  });
  rtl.createClass($mod,"TList$G12",$mod.TCustomList$G19,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G17,function () {
    });
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
  });
  rtl.createClass($mod,"TEnumerable$G27",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G20",$mod.TEnumerable$G27,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TList$G13",$mod.TCustomList$G20,function () {
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
  });
  rtl.createClass($mod,"TEnumerable$G28",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G21",$mod.TEnumerable$G28,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TList$G14",$mod.TCustomList$G21,function () {
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
    this.GetItem = function (AIndex) {
      var Result = null;
      if ((AIndex < 0) || (AIndex >= this.FLength)) throw pas.SysUtils.EArgumentOutOfRangeException.$create("Create$1",[rtl.getResStr(pas["Generics.Strings"],"SArgumentOutOfRange")]);
      Result = this.FItems[AIndex];
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
  });
  rtl.createClass($mod,"TEnumerable$G29",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G22",$mod.TEnumerable$G29,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TList$G15",$mod.TCustomList$G22,function () {
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
  });
  rtl.createClass($mod,"TEnumerable$G30",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G23",$mod.TEnumerable$G30,function () {
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
    this.Notify = function (AValue, ACollectionNotification) {
      if (this.FOnNotify != null) this.FOnNotify(this,AValue,ACollectionNotification);
    };
  });
  rtl.createClass($mod,"TList$G16",$mod.TCustomList$G23,function () {
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
  });
  rtl.createClass($mod,"TEnumerator$G32",pas.System.TObject,function () {
    this.MoveNext = function () {
      var Result = false;
      Result = this.DoMoveNext();
      return Result;
    };
  });
  rtl.createClass($mod,"TEnumerable$G31",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TCustomList$G24",$mod.TEnumerable$G31,function () {
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
  });
  rtl.createClass($mod,"TCustomListEnumerator$G22",$mod.TEnumerator$G32,function () {
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
  });
  rtl.createClass($mod,"TList$G17",$mod.TCustomList$G24,function () {
    rtl.createClass(this,"TEnumerator",$mod.TCustomListEnumerator$G22,function () {
    });
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
  });
});
rtl.module("uVector",["System","Classes","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT($mod,"TVector",function () {
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
  });
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
  this.VectorDot = function (ALeft, ARight) {
    var Result = 0.0;
    Result = (ALeft.x * ARight.x) + (ALeft.y * ARight.y) + (ALeft.z * ARight.z);
    return Result;
  };
});
rtl.module("Graphics",["System"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("uFace",["System","uVector","Graphics","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  this.TFaceType = {"0": "ftUnknown", ftUnknown: 0, "1": "ftConvex", ftConvex: 1, "2": "ftReflex", ftReflex: 2};
  rtl.recNewT($mod,"TFaceVertex",function () {
    this.$eq = function (b) {
      return true;
    };
    this.$assign = function (s) {
      return this;
    };
  });
  rtl.createClass($mod,"TFace",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FSpikes = null;
      this.FConvexity = 0;
      this.FVertices = null;
      this.Color = 0;
      this.TextureId = 0;
    };
    this.$final = function () {
      this.FSpikes = undefined;
      this.FVertices = undefined;
      pas.System.TObject.$final.call(this);
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
    this.Invalidate = function () {
      this.FConvexity = $mod.TFaceType.ftUnknown;
    };
  });
},[]);
rtl.module("uMatrix",["System","uVector"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass($mod,"TMatrix",pas.System.TObject,function () {
    this.GetMoveMatrix = function (d) {
      var Result = rtl.arraySetLength(null,0.0,4,4);
      Result = $impl.FSingleMatrix.slice(0);
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
      Result = $impl.FSingleMatrix.slice(0);
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
},["SysUtils"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.FSingleMatrix = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
});
rtl.module("uPart",["System","uMatrix","uVector","uFace","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass($mod,"TPart",pas.System.TObject,function () {
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
    this.Trans = function (Matrix) {
      var i = 0;
      for (var $l = 0, $end = this.FVertices.FLength - 1; $l <= $end; $l++) {
        i = $l;
        this.FVertices.SetItem(i,pas.uMatrix.TMatrix.VectorMul(Matrix,this.FVertices.GetItem(i)));
      };
    };
  });
},["SysUtils"]);
rtl.module("uSolvedState",["System","Generics.Collections","uVector"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass($mod,"TFaceProperties",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TSolvedState",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FacesProperties = null;
    };
    this.$final = function () {
      this.FacesProperties = undefined;
      pas.System.TObject.$final.call(this);
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
  });
  rtl.createClass($mod,"TSolvedStates",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.FSolvedStates = null;
    };
    this.$final = function () {
      this.FSolvedStates = undefined;
      pas.System.TObject.$final.call(this);
    };
    this.Create$1 = function () {
      this.FSolvedStates = pas["Generics.Collections"].TList$G15.$create("Create$1");
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
},["uPuzzle","uFace","uPart","Graphics"]);
rtl.module("uLine",["System","uMatrix","uVector"],function () {
  "use strict";
  var $mod = this;
  rtl.recNewT($mod,"TLine",function () {
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
},[]);
rtl.module("uUtils",["System","Classes","Graphics"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass($mod,"TUtils",pas.System.TObject,function () {
    var delta = 1e-5;
    this.PrivPi = function (Al) {
      var Result = 0.0;
      while (Al > Math.PI) Al = Al - (2 * Math.PI);
      while (Al < -Math.PI) Al = Al + (2 * Math.PI);
      if (Al < (-Math.PI + 0.00001)) Al = Math.PI;
      Result = Al;
      return Result;
    };
  });
  $mod.$init = function () {
  };
},["SysUtils"]);
rtl.module("uLayer",["System","uMatrix","uPart","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass($mod,"TLayer",pas.System.TObject,function () {
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
    };
    this.$final = function () {
      this.AvailableAngles = undefined;
      pas.System.TObject.$final.call(this);
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
      Al = Al - 0.0001;
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
      Al = Al + 0.0001;
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
        if (Math.abs(pas.uUtils.TUtils.PrivPi(Al - this.AvailableAngles[i])) < 0.0001) return Result;
      };
      Result = false;
      return Result;
    };
  });
},["uUtils","SysUtils"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.DELTA = 1e-4;
});
rtl.module("uAxis",["System","uLine","uLayer","uVector","uMatrix","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass($mod,"TAxis",pas.System.TObject,function () {
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
      this.Line.Trans(mat.slice(0));
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
  });
},["uUtils"]);
rtl.module("uMacro",["System","Generics.Collections","Types","Classes"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass($mod,"TMacro",pas.System.TObject,function () {
  });
});
rtl.module("uSelection",["System","uFace","uPart","uAxis","uVector","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  rtl.createClass($mod,"TMovingParts",pas.System.TObject,function () {
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
      this.FMovingParts = pas["Generics.Collections"].TList$G10.$create("Create$1");
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
  rtl.createClass($mod,"TSelection",pas.System.TObject,function () {
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
  rtl.createClass($mod,"TVectorCommand",pas.System.TObject,function () {
  });
  rtl.createClass($mod,"TVectorImage",pas.System.TObject,function () {
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
  rtl.createClass($mod,"TTexture",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.VectorImage = null;
    };
    this.$final = function () {
      this.VectorImage = undefined;
      pas.System.TObject.$final.call(this);
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
  rtl.createClass($mod,"TPuzzleHeader",pas.System.TObject,function () {
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
  rtl.recNewT($mod,"TPartPosition",function () {
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
  rtl.createClass($mod,"TPuzzleBase",pas.System.TObject,function () {
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
          Part.Trans(mat.slice(0));
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
          Axis.Trans(mat.slice(0));
        }
      } finally {
        $in = rtl.freeLoc($in)
      };
    };
    this.Create$1 = function () {
      pas.System.TObject.Create.call(this);
      this.Header = pas.uPuzzleHeader.TPuzzleHeader.$create("Create$1");
      this.FAxes = pas["Generics.Collections"].TList$G12.$create("Create$1");
      this.FParts = pas["Generics.Collections"].TList$G10.$create("Create$1");
      this.FTextures = pas["Generics.Collections"].TList$G13.$create("Create$1");
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
      Axis = $Self.FAxes.GetItem(AxisNo);
      GetProjectionBoundaries();
      iFrom.set(0);
      for (var $l = 1, $end = Axis.Layers.FLength - 1; $l <= $end; $l++) {
        i = $l;
        if (Axis.Layers.GetItem(i).DistanceFrom < (AMin + 0.0001)) {
          iFrom.set(i)}
         else break;
      };
      iTo.set(Axis.Layers.FLength - 1);
      for (var $l1 = Axis.Layers.FLength - 2; $l1 >= 0; $l1--) {
        i = $l1;
        if (Axis.Layers.GetItem(i).DistanceTo > (AMax - 0.0001)) {
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
  rtl.createClass($mod,"TTurn",pas.System.TObject,function () {
    this.$init = function () {
      pas.System.TObject.$init.call(this);
      this.typ = 0;
      this.AxisNo = 0;
      this.Layers = [];
      this.Angle = 0.0;
    };
    this.$final = function () {
      this.Layers = undefined;
      pas.System.TObject.$final.call(this);
    };
  });
});
rtl.module("Math",["System"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("uPuzzle",["System","uSolvedState","uMatrix","uPart","uAxis","uMacro","uSelection","uPuzzleBase","uTurn","Classes","Generics.Collections"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.TTurningState = {"0": "tsFree", tsFree: 0, "1": "tsMidTurn", tsMidTurn: 1, "2": "tsTurningAnimated", tsTurningAnimated: 2, "3": "tsWholeRotating", tsWholeRotating: 3};
  this.TTurningType = {"0": "ttManual", ttManual: 0, "1": "ttScramble", ttScramble: 1, "2": "ttUndo", ttUndo: 2, "3": "ttRedo", ttRedo: 3, "4": "ttMacro", ttMacro: 4};
  this.TCheckSolvedProc = {"0": "cspEachColorHasSameDirection", cspEachColorHasSameDirection: 0, "1": "cspEachColorHasSameOrOppositeDirection", cspEachColorHasSameOrOppositeDirection: 1, "2": "cspCountUniquePlanes", cspCountUniquePlanes: 2, "3": "cspEachFaceConsistsOfDifferentColors", cspEachFaceConsistsOfDifferentColors: 3, "4": "cspEachRowColDiagConsistsOfDifferentColors", cspEachRowColDiagConsistsOfDifferentColors: 4, "5": "cspCheckSavedStates", cspCheckSavedStates: 5, "6": "cspEachPlaneHasOneColor", cspEachPlaneHasOneColor: 6, "7": "cspEachColorHasSameDirectionOrCountUniquePlanes", cspEachColorHasSameDirectionOrCountUniquePlanes: 7, "8": "cspAdjoiningFacesHaveSameColors", cspAdjoiningFacesHaveSameColors: 8, "9": "cspEachRowColConsistsOfDifferentColors", cspEachRowColConsistsOfDifferentColors: 9};
  rtl.createClass($mod,"TPuzzle",pas.uPuzzleBase.TPuzzleBase,function () {
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
      if (Math.abs(Angle) < 0.0001) return;
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
    this.LayerTurnable = function (AxisNo, Layers, RotateDirection) {
      var Result = false;
      var Layer = null;
      var Axis = null;
      var i = 0;
      Axis = this.FAxes.GetItem(AxisNo);
      Result = false;
      for (var $l = 0, $end = rtl.length(Layers) - 1; $l <= $end; $l++) {
        i = $l;
        if (Layers[i]) {
          Layer = Axis.Layers.GetItem(i);
          if ((RotateDirection < 0) && (Layer.Angle < (Layer.MinAngle + 0.001))) return Result;
          if ((RotateDirection > 0) && (Layer.Angle > (Layer.MaxAngle - 0.001))) return Result;
          if ((RotateDirection === 0) && ((Layer.Angle < (Layer.MinAngle + 0.001)) || (Layer.Angle > (Layer.MaxAngle - 0.001)))) return Result;
        };
      };
      Result = true;
      return Result;
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
      if (this.FMovingParts.TurnWithAxes) this.TransAxes(mat.slice(0),this.FAxes);
      this.TransParts(mat.slice(0),this.FMovingParts.FMovingParts);
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
        while (Math.abs(AngleToTurn) > 0.0000001) {
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
        if ((Al < (AngleMin - 0.00001)) || (Al > (AngleMax + 0.00001))) return Result;
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
      TurnWithAxes = $Self.IsTurnWithAxes(AxisNo,Layers);
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
      Axis = $Self.FAxes.GetItem(AxisNo);
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
        if ((AnglePlus > PI2) || (AnglePlus > (AngleMax + 0.001))) break;
        PlusValid = AngleValid(AnglePlus);
        if (!PlusValid) AnglePlus = AnglePlus + 0.01;
      };
      MinusValid = false;
      while (!MinusValid) {
        AngleMinus = FirstLayer.GetPrevAngle(FirstLayer.Angle + AngleMinus) - FirstLayer.Angle;
        if ((AngleMinus < -PI2) || (AngleMinus < (AngleMin - 0.001))) break;
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
      this.TransSelection(mat.slice(0));
      if (this.FOnTransLayers != null) this.FOnTransLayers(mat.slice(0),AxisNo,Layers);
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
      this.FMarks = pas["Generics.Collections"].TList$G6.$create("Create$1");
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
    this.Scramble = function () {
      var i = 0;
      var AxisNo = 0;
      var LayerNo = 0;
      var Angle = 0.0;
      var Axis = null;
      for (i = 0; i <= 200; i++) {
        AxisNo = pas.System.Random(this.FAxes.FLength);
        pas.uSelection.TSelection.TurnAxisNo = AxisNo;
        Axis = this.FAxes.GetItem(AxisNo);
        LayerNo = pas.System.Random(Axis.Layers.FLength);
        if (!this.CalcMovingLayers$1(AxisNo,LayerNo,1)) continue;
        if (Axis.IsLayerFixed(pas.uSelection.TSelection.TurnLayers)) continue;
        if (this.IsTurningWhole(pas.uSelection.TSelection.TurnLayers)) continue;
        Angle = Axis.Layers.GetItem(LayerNo).FTurningAngle;
        Angle = Angle * (pas.System.Random(Math.round((2 * Math.PI) / Angle) - 1) + 1);
        this.GetRotateAngleRange(AxisNo,pas.uSelection.TSelection.TurnLayers,{p: pas.uSelection.TSelection.TSelection, get: function () {
            return this.p.AngleMin;
          }, set: function (v) {
            this.p.AngleMin = v;
          }},{p: pas.uSelection.TSelection.TSelection, get: function () {
            return this.p.AngleMax;
          }, set: function (v) {
            this.p.AngleMax = v;
          }});
        Angle = this.GetTurningAngle(AxisNo,pas.uSelection.TSelection.TurnLayers,Angle,pas.uSelection.TSelection.AngleMin,pas.uSelection.TSelection.AngleMax);
        if ((Angle > (pas.uSelection.TSelection.AngleMax + 0.001)) || (Angle < (pas.uSelection.TSelection.AngleMin - 0.001))) continue;
        pas.uSelection.TSelection.RotateDirection = Math.sign(Angle);
        if (this.LayerTurnable(AxisNo,pas.uSelection.TSelection.TurnLayers,pas.uSelection.TSelection.RotateDirection)) {
          this.BeforeTurnEvent($mod.TTurningType.ttScramble,AxisNo,{p: pas.uSelection.TSelection.TSelection, get: function () {
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
          if ((Angle >= (pas.uSelection.TSelection.AngleMin - 0.001)) && (Angle <= (pas.uSelection.TSelection.AngleMax + 0.001))) {
            if (this.FOnBeforeTurn != null) this.FOnBeforeTurn($mod.TTurningType.ttScramble,$mod.TTurningState.tsFree);
            this.RotateLayers(AxisNo,pas.uSelection.TSelection.TurnLayers,Angle,false);
            this.AfterTurnEvent($mod.TTurningType.ttScramble);
            if (this.FOnAfterTurn != null) this.FOnAfterTurn($mod.TTurningType.ttScramble,$mod.TTurningState.tsFree);
          };
        };
      };
      for (i = 0; i <= 2000; i++) {
        AxisNo = pas.System.Random(this.FAxes.FLength);
        LayerNo = pas.System.Random(this.FAxes.GetItem(AxisNo).Layers.FLength);
        Angle = Math.PI * ((Math.random() * 2) - 1);
        pas.uSelection.TSelection.TurnAxisNo = AxisNo;
        Axis = this.FAxes.GetItem(AxisNo);
        if (!this.CalcMovingLayers$1(AxisNo,LayerNo,1)) continue;
        if (Axis.IsLayerFixed(pas.uSelection.TSelection.TurnLayers)) continue;
        if (this.IsTurningWhole(pas.uSelection.TSelection.TurnLayers)) continue;
        this.GetRotateAngleRange(AxisNo,pas.uSelection.TSelection.TurnLayers,{p: pas.uSelection.TSelection.TSelection, get: function () {
            return this.p.AngleMin;
          }, set: function (v) {
            this.p.AngleMin = v;
          }},{p: pas.uSelection.TSelection.TSelection, get: function () {
            return this.p.AngleMax;
          }, set: function (v) {
            this.p.AngleMax = v;
          }});
        Angle = this.GetTurningAngle(AxisNo,pas.uSelection.TSelection.TurnLayers,Angle,pas.uSelection.TSelection.AngleMin,pas.uSelection.TSelection.AngleMax);
        if ((Angle > (pas.uSelection.TSelection.AngleMax + 0.001)) || (Angle < (pas.uSelection.TSelection.AngleMin - 0.001))) continue;
        pas.uSelection.TSelection.RotateDirection = Math.sign(Angle);
        if (this.LayerTurnable(AxisNo,pas.uSelection.TSelection.TurnLayers,pas.uSelection.TSelection.RotateDirection)) {
          this.BeforeTurnEvent($mod.TTurningType.ttScramble,AxisNo,{p: pas.uSelection.TSelection.TSelection, get: function () {
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
          if ((Angle >= (pas.uSelection.TSelection.AngleMin - 0.001)) && (Angle <= (pas.uSelection.TSelection.AngleMax + 0.001))) {
            if (this.FOnBeforeTurn != null) this.FOnBeforeTurn($mod.TTurningType.ttScramble,$mod.TTurningState.tsFree);
            this.RotateLayers(AxisNo,pas.uSelection.TSelection.TurnLayers,Angle,false);
            this.AfterTurnEvent($mod.TTurningType.ttScramble);
            if (this.FOnAfterTurn != null) this.FOnAfterTurn($mod.TTurningType.ttScramble,$mod.TTurningState.tsFree);
          };
        };
      };
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
    this.RotateLayers = function (AxisNo, Layers, Al, AllowWhole) {
      if (this.FCheckSliceEnabled) if (!this.GetMovingParts(AxisNo,Layers)) if (!AllowWhole) return;
      if (this.FCheckFixedLayersEnabled) if (this.FAxes.GetItem(AxisNo).IsLayerFixed(Layers)) return;
      this.RotateWOCheckWOAnimation(AxisNo,Layers,Al);
      if (this.FUndoRecordEnabled) this.AddUndo(AxisNo,Layers,Al);
      this.ClearRedoStack();
    };
    this.BeforeTurnEvent = function (AType, AxisNo, Layers, AngleMin, AngleMax, RotateDirection) {
    };
    this.TurningEvent = function (AType) {
    };
    this.AfterTurnEvent = function (AType) {
      this.PositionsInvalidate();
    };
    this.DisableAnimation = function () {
      this.FAnimationEnabled = false;
    };
  });
  $mod.$init = function () {
  };
},["uUtils","uLayer","Math","SysUtils"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.DELTA = 1e-3;
  $impl.DELTA_ANGLE = 1e-5;
});
rtl.module("program",["System","JS","Web","SysUtils","uPuzzle"],function () {
  "use strict";
  var $mod = this;
  this.StatusNode = null;
  this.API = null;
  this.CurrentPuzzle = null;
  this.OriginalXml = "";
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
    Result = "0.1.0";
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
  this.APIScramble = function () {
    if (!$mod.APIIsPuzzleReady()) {
      $mod.SetStatus("Scramble unavailable: load a valid puzzle XML first.");
      return;
    };
    $mod.CurrentPuzzle.DisableAnimation();
    $mod.CurrentPuzzle.Scramble();
    $mod.SetStatus("Scrambled using the original Pascal TPuzzle engine.");
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
    if (!$mod.APIIsPuzzleReady()) {
      $mod.SetStatus("Reset unavailable: no puzzle is loaded.")}
     else $mod.SetStatus("Reset adapter is not implemented yet.");
  };
  this.APIOpenLibrary = function () {
    $mod.SetStatus("Puzzle library is not ported to the browser yet.");
  };
  this.APILoadXML = function (XmlText) {
    var Result = false;
    Result = false;
    if (pas.SysUtils.Trim(XmlText) === "") {
      $mod.SetStatus("XML load failed: selected file is empty.")}
     else $mod.SetStatus("XML received (" + pas.SysUtils.IntToStr(XmlText.length) + " characters), but XML-to-TPuzzle loading is not implemented yet.");
    return Result;
  };
  this.InstallBrowserAPI = function () {
    $mod.API = pas.JS.New([]);
    $mod.API["version"] = "0.1.0";
    $mod.API["getStatus"] = $mod.APIGetStatus;
    $mod.API["getVersion"] = $mod.APIGetVersion;
    $mod.API["isPuzzleReady"] = $mod.APIIsPuzzleReady;
    $mod.API["getModelInfo"] = $mod.APIGetModelInfo;
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
    $mod.CurrentPuzzle.DisableAnimation();
    $mod.OriginalXml = "";
    $mod.InstallBrowserAPI();
    $mod.SetStatus("Pascal TPuzzle model instantiated. Load a puzzle definition to begin.");
  };
});
