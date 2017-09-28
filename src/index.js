'use strict';

const metrics = require('legion-metrics');
const instrument = require('legion-instrument');
const Io = require('legion-io');
const package_json = require('../package.json');

const SUPPORTED_IO_METHODS = ['chain', 'run', '_type'];

const Handler = {};

function pathTo(property) {
  if( typeof property === 'string' && !(/^\d+$/).test(property) ) {
    return '.' + property;
  }

  return '[' + property.toString() + ']';
}

Handler.get = function(target, property) {
  proxyLog(target.path + ' : GET ' + property);

  if( property === 'inspect' )
    return () => package_json.name + ' ' + target.path;

  if( property === 'then' || property === 'catch' )
    throw new Error('Called "' + property + '" but this Legion wrapper object is not a real promise.');

  let ioMethod = target.io[property];

  if( ioMethod !== undefined ) {
    if( !SUPPORTED_IO_METHODS.includes(property) )
      throw new Error('Called "' + property + '" which is a Legion Io method, but this Legion wrapper object only supports: ' + SUPPORTED_IO_METHODS + '. Throwing this error as safeguard against difficult-to-troubleshoot bugs. If you wanted to call the method on the Io object, consider re-wrapping the wrapper object in a vanilla Io. If you wanted to call a method on the backing API object, you could try somehow calling it by a different name, or complain to the Legion maintainers to make this situation easier.');

    if( typeof ioMethod === 'function' )
      ioMethod = ioMethod.bind(target.io);
    return ioMethod;
  }

  return proxify(Object.assign({}, target, {
    action: target.action.chain(x => Object.assign({ parent: x.value, value: x.value[property] })),
    path: target.path + pathTo(property)
  }));
};

Handler.apply = function(target, _thisArg, args) {
  proxyLog(target.path + ' : APPLY ' + args);

  return proxify(Object.assign({}, target, {
    action: target.action.chain(x => Object.assign({ parent: undefined, value: x.value.apply(x.parent, args) })),
    path: target.path + '()'
  }));
};

Handler.has = function(target, property) {
  proxyLog(target.path + ' : HAS ' + property);

  if( property === 'inspect' )
    return true;

  return property in target.io;
};

function thenable(result) {
  if( result.then )
    return Promise.resolve(result);

  throw new Error('Result ' + result + ' is not thenable.');
}

function proxifyRoot(action, options) {
  options = Object.assign({}, {
    apiname: 'AnonymousProxy.root',
    io: undefined
  }, options || {});

  return proxify({
    action: Io.of().chain(() => action).chain(x => Object.assign({ parent: undefined, value: x})),
    path: options.apiname,
    apiname: options.apiname,
    io: undefined
  });
}

function proxify(context) {
  const io = Io.of().chain(instrument(context.action.chain(x => thenable(x.value)), [metrics.tags.api(context.apiname),metrics.tags.apiCall(context.path)]));

  return new Proxy(Object.assign(() => undefined, context, { io: io }), Handler);
}

module.exports = proxifyRoot;

function proxyLog(msg) {
  if( process.env.LEGION_PROXY_LOG )
    console.log(msg);  // eslint-disable-line no-console
}
