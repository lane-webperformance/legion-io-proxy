'use strict';

const core = require('legion-core');
const Io = require('legion-io');
const metrics = require('legion-metrics');
const proxify = require('../src/index');

// Silly is a class that serves as a test object that we can proxify for unit testing purposes.
const Silly = {};

Silly.goofy_promise = Promise.resolve('goofy');

Silly.goofyFunction = function() {
  return this.goofy_promise.then(goofy => goofy + ' unit test message');
};

Silly.goofy = {};

Silly.goofy.foo = () => Object.assign([Promise.resolve('bar'), Promise.resolve('baz')]);

describe('The Legion Proxy object', function() {
  it('is an Io', function() {
    expect(Io.isIo(proxify(Silly))).toBe(true);
  });

  it('supports Io methods', function() {
    expect(() => proxify(Silly).chain(x => x)).not.toThrow();
  });

  it('supports the node "inspect" method', function() {
    expect(proxify(Silly, { apiname: 'Silly' }).goofy_promise.inspect()).toBe('legion-io-proxy Silly.goofy_promise');
  });

  it('supports accessing member fields', function(done) {
    const testcase = proxify(Silly).goofy_promise.chain(goofy => expect(goofy).toBe('goofy'));

    testcase.run(core.Services.create().withMetricsTarget(metrics.Target.create(metrics.merge)))
      .then(done).catch(done.fail);
  });

  it('supports accessing member array elements', function(done) {
    const testcase = proxify(Silly).goofy.foo()[1].chain(goofy => expect(goofy).toBe('baz'));

    testcase.run(core.Services.create().withMetricsTarget(metrics.Target.create(metrics.merge)))
      .then(done).catch(done.fail);
  });

  it('supports calling member functions', function(done) {
    const testcase = proxify(Silly).goofyFunction().chain(goofy => expect(goofy).toBe('goofy unit test message'));

    testcase.run(core.Services.create().withMetricsTarget(metrics.Target.create(metrics.merge)))
      .then(done).catch(done.fail);
  });

  it('can test the existence of its members (for its Io nature only)', function() {
    const proxy = proxify(Silly);

    expect('chain' in proxy).toBe(true);
    expect('_type' in proxy).toBe(true);
  });

  it('requires that the result be a thenable', function(done) {
    const testcase = proxify(Silly).goofy.foo().chain(x => x.length);

    testcase.run(core.Services.create().withMetricsTarget(metrics.Target.create(metrics.merge)))
      .then(done.fail).catch(done);
  });

  it("doesn't allow calling then() on anything", function() {
    expect(() => proxify(Silly).goofy_promise.then(() => fail())).toThrow();
  });

  it("doesn't allow calling most Io methods", function() {
    expect(() => proxify(Silly).goofy_promise.map(() => fail())).toThrow();
  });

  it('instruments API calls', function(done) {
    const SillyProxy = proxify(Silly, { apiname: 'Silly' });
    const testcase = SillyProxy.goofyFunction().chain(SillyProxy.goofy.foo()[0]);
    const target = metrics.Target.create(metrics.merge);

    testcase.run(core.Services.create().withMetricsTarget(target))
      .then(() => {
        const metrics = JSON.stringify(target.get());
        expect(JSON.parse(metrics).tags.api.SillyProxy).not.toBe(null);
        expect(JSON.parse(metrics).tags['api-call']['Silly.goofyFunction()']).toBeTruthy();
        expect(JSON.parse(metrics).tags['api-call']['Silly.goofy.foo()[0]']).toBeTruthy();
      }).then(done).catch(done.fail);
  });
});
