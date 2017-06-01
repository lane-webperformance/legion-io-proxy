'use strict';

const metrics = require('legion-metrics');
const instrument = require('legion-instrument');
const Io = require('legion-io');

const SUPPORTED_IO_METHODS = ['chain', 'run', '_type'];

const Handler = {};

function pathTo(property) {
  if( typeof property === 'number' )
    return '[' + property + ']';

  if( typeof property === 'string' )
    return '.' + property;

  if( typeof property === 'symbol' )
    return '[' + property.toString + ']';
}

Handler.get = function(target, property) {
  console.log(target.path + ' : GET ' + property);  // eslint-disable-line no-console

  if( property === 'inspect' )
    return () => 'Legion ' + target.path;

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
  console.log(target.path + ' : APPLY ' + args);  // eslint-disable-line no-console

  return proxify(Object.assign({}, target, {
    action: target.action.chain(x => Object.assign({ parent: undefined, value: x.value.apply(x.parent, args) })),
    path: target.path + '()'
  }));
};

Handler.has = function(target, property) {
  console.log(target.path + ' : HAS ' + property);  // eslint-disable-line no-console

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
    apiname: 'AnonymousProxy',
    apicall: 'root',
    followup: x => x,
    io: undefined
  }, options || {});

  return proxify({
    action: Io.of().chain(() => action).chain(x => Object.assign({ parent: undefined, value: x})),
    path: (options.apiname + '.' + options.apicall),
    apiname: options.apiname,
    apicall: options.apicall,
    followup: options.followup,
    io: undefined
  });
}

function proxify(context) {
  const io = Io.of().chain(instrument(context.action.chain(x => thenable(x.value)), [metrics.tags.api(context.apiname),metrics.tags.apiCall(context.path)]));

  return new Proxy(Object.assign(() => undefined, context, { io: io }), Handler);
}

module.exports = proxifyRoot;
