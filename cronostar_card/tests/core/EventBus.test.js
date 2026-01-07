import { describe, it, expect, vi } from 'vitest';
import { EventBus, Events } from '../../src/core/EventBus.js';

describe('EventBus', () => {
  it('should register and trigger listeners', () => {
    const bus = new EventBus();
    const callback = vi.fn();
    const data = { test: 123 };

    bus.on(Events.STATE_CHANGED, callback);
    bus.emit(Events.STATE_CHANGED, data);

    expect(callback).toHaveBeenCalledWith(data);
  });

  it('should unsubscribe correctly using the return function', () => {
    const bus = new EventBus();
    const callback = vi.fn();

    const unsub = bus.on('test', callback);
    unsub();
    bus.emit('test', 'data');

    expect(callback).not.toHaveBeenCalled();
  });

  it('should support multiple listeners for the same event', () => {
    const bus = new EventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bus.on('test', cb1);
    bus.on('test', cb2);
    bus.emit('test', 'data');

    expect(cb1).toHaveBeenCalledWith('data');
    expect(cb2).toHaveBeenCalledWith('data');
  });

  it('should catch and log errors in callbacks without stopping execution', () => {
    const bus = new EventBus();
    const errorCb = () => { throw new Error('Boom'); };
    const successCb = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.on('test', errorCb);
    bus.on('test', successCb);
    
    // Should not throw
    expect(() => bus.emit('test', 'data')).not.toThrow();
    expect(successCb).toHaveBeenCalledWith('data');
    expect(spy).toHaveBeenCalled();
    
    spy.mockRestore();
  });

  it('should clear all listeners', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('test', cb);
    bus.clear();
    bus.emit('test', 'data');
    expect(cb).not.toHaveBeenCalled();
  });
});
