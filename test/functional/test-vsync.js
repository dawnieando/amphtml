/**
 * Copyright 2015 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Vsync} from '../../src/service/vsync-impl';
import * as sinon from 'sinon';


describe('vsync', () => {
  let sandbox;
  let clock;
  let vsync;
  let viewer;
  let saveVisibilityChangedHandler;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    clock = sandbox.useFakeTimers();
    saveVisibilityChangedHandler = undefined;
    viewer = {
      isVisible: () => true,
      onVisibilityChanged: handler => saveVisibilityChangedHandler = handler,
    };
    vsync = new Vsync(window, viewer);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should init correctly', () => {
    expect(vsync.canAnimate()).to.be.true;
    expect(saveVisibilityChangedHandler).to.exist;
  });

  it('should generate a frame and run callbacks', () => {
    let result = '';
    return new Promise(resolve => {
      vsync.run({
        measure: () => {
          result += 'me1';
        },
        mutate: () => {
          result += 'mu1';
        },
      });
      vsync.run({
        measure: () => {
          result += 'me2';
        },
        mutate: () => {
          result += 'mu2';
        },
      });
      vsync.run({
        measure: () => {
          result += 'me3';
        },
      });
      vsync.run({
        mutate: () => {
          result += 'mu3';
        },
      });
      vsync.mutate(() => {
        result += 'mu4';
        resolve();
      });
      vsync.measure(() => {
        result += 'me4';
        resolve();
      });
    }).then(() => {
      expect(result).to.equal('me1me2me3me4mu1mu2mu3mu4');
    });
  });

  it('should schedule nested vsyncs', () => {
    let result = '';
    return new Promise(resolve => {
      vsync.run({
        measure: () => {
          result += 'me1';
          vsync.run({
            measure: () => {
              result += 'me2';
            },
            mutate: () => {
              result += 'mu2';
              vsync.run({
                measure: () => {
                  result += 'me3';
                },
              });
              vsync.run({
                mutate: () => {
                  result += 'mu3';
                  resolve();
                },
              });
            },
          });
        },
        mutate: () => {
          result += 'mu1';
        },
      });
    }).then(() => {
      expect(result).to.equal('me1mu1me2mu2me3mu3');
    });
  });

  it('should return a promise from runPromise that executes "run"', () => {
    const measureSpy = sandbox.spy();
    const mutateSpy = sandbox.spy();
    return vsync.runPromise({measure: measureSpy, mutate: mutateSpy})
        .then(() => {
          expect(mutateSpy.callCount).to.equal(1);
          expect(measureSpy.callCount).to.equal(1);
        });
  });

  it('should return a promise from measurePromise that runs measurer', () => {
    let measured = false;
    return vsync.measurePromise(() => {
      measured = true;
    }).then(() => {
      expect(measured).to.be.true;
    });
  });

  it('should return a promise from mutatePromise that runs mutator', () => {
    const mutator = sandbox.spy();
    return vsync.mutatePromise(mutator).then(() => {
      expect(mutator.callCount).to.equal(1);
    });
  });

  it('should schedule via animation frames when doc is visible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => true;

    let result = '';
    vsync.run({
      mutate: () => {
        result += 'mu1';
      },
    });

    expect(vsync.tasks_).to.have.length(1);
    expect(vsync.scheduled_).to.be.true;
    expect(rafHandler).to.exist;
    expect(vsync.pass_.isPending()).to.be.false;

    rafHandler();
    expect(result).to.equal('mu1');
    expect(vsync.tasks_).to.have.length(0);
    expect(vsync.scheduled_).to.be.false;
  });

  it('should schedule via timer frames when doc is not visible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => false;

    let result = '';
    vsync.run({
      mutate: () => {
        result += 'mu1';
      },
    });

    expect(vsync.tasks_).to.have.length(1);
    expect(vsync.scheduled_).to.be.true;
    expect(rafHandler).to.be.undefined;
    expect(vsync.pass_.isPending()).to.be.true;

    clock.tick(17);
    expect(result).to.equal('mu1');
    expect(vsync.tasks_).to.have.length(0);
    expect(vsync.scheduled_).to.be.false;
    expect(vsync.pass_.isPending()).to.be.false;
  });

  it('should re-schedule when doc goes invisible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => true;

    let result = '';
    vsync.run({
      mutate: () => {
        result += 'mu1';
      },
    });

    expect(vsync.tasks_).to.have.length(1);
    expect(vsync.scheduled_).to.be.true;
    expect(rafHandler).to.exist;
    expect(vsync.pass_.isPending()).to.be.false;

    viewer.isVisible = () => false;
    saveVisibilityChangedHandler();

    expect(vsync.tasks_).to.have.length(1);
    expect(vsync.scheduled_).to.be.true;
    expect(vsync.pass_.isPending()).to.be.true;

    clock.tick(17);
    expect(result).to.equal('mu1');
    expect(vsync.tasks_).to.have.length(0);
    expect(vsync.scheduled_).to.be.false;
    expect(vsync.pass_.isPending()).to.be.false;
  });

  it('should re-schedule when doc goes visible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => false;

    let result = '';
    vsync.run({
      mutate: () => {
        result += 'mu1';
      },
    });

    expect(vsync.tasks_).to.have.length(1);
    expect(vsync.scheduled_).to.be.true;
    expect(rafHandler).to.be.undefined;
    expect(vsync.pass_.isPending()).to.be.true;

    viewer.isVisible = () => true;
    saveVisibilityChangedHandler();

    expect(vsync.tasks_).to.have.length(1);
    expect(vsync.scheduled_).to.be.true;
    expect(rafHandler).to.exist;

    rafHandler();
    expect(result).to.equal('mu1');
    expect(vsync.tasks_).to.have.length(0);
    expect(vsync.scheduled_).to.be.false;
  });

  it('should NOT re-schedule when no tasks pending', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => true;

    expect(vsync.tasks_).to.have.length(0);
    expect(vsync.scheduled_).to.be.false;
    expect(rafHandler).to.be.undefined;
    expect(vsync.pass_.isPending()).to.be.false;

    viewer.isVisible = () => false;
    saveVisibilityChangedHandler();

    expect(vsync.tasks_).to.have.length(0);
    expect(vsync.scheduled_).to.be.false;
    expect(rafHandler).to.be.undefined;
    expect(vsync.pass_.isPending()).to.be.false;
  });

  it('should run anim task when visible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => true;

    let result = '';
    const res = vsync.runAnim({
      mutate: () => {
        result += 'mu1';
      },
    });

    expect(res).to.be.true;
    expect(rafHandler).to.exist;
    expect(vsync.scheduled_).to.be.true;

    rafHandler();
    expect(result).to.equal('mu1');
  });

  it('should create and run anim task when visible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => true;

    let result = '';
    const task = vsync.createAnimTask({
      mutate: () => {
        result += 'mu1';
      },
    });
    const res = task();

    expect(res).to.be.true;
    expect(rafHandler).to.exist;
    expect(vsync.scheduled_).to.be.true;

    rafHandler();
    expect(result).to.equal('mu1');
  });

  it('should NOT run anim task when invisible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => false;

    let result = '';
    const res = vsync.runAnim({
      mutate: () => {
        result += 'mu1';
      },
    });

    expect(res).to.be.false;
    expect(rafHandler).to.be.undefined;
    expect(vsync.scheduled_).to.be.false;
  });

  it('should create but NOT run anim task when invisible', () => {
    let rafHandler;
    vsync.raf_ = handler => rafHandler = handler;
    viewer.isVisible = () => false;

    let result = '';
    const task = vsync.createAnimTask({
      mutate: () => {
        result += 'mu1';
      },
    });
    const res = task();

    expect(res).to.be.false;
    expect(rafHandler).to.be.undefined;
    expect(vsync.scheduled_).to.be.false;
  });

  it('should reject mutate series when invisible', () => {
    viewer.isVisible = () => false;
    const mutatorSpy = sandbox.spy();

    const promise = vsync.runAnimMutateSeries(mutatorSpy);
    return promise.then(() => {
      return 'SUCCESS';
    }, error => {
      return 'ERROR: ' + error;
    }).then(response => {
      expect(response).to.match(/^ERROR/);
      expect(mutatorSpy.callCount).to.equal(0);
    });
  });
});


describe('RAF polyfill', () => {
  let sandbox;
  let clock;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    clock = sandbox.useFakeTimers();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const viewer = {
    isVisible: () => true,
    onVisibilityChanged: unusedHandler => {},
  };

  const vsync = new Vsync({
    setTimeout: (fn, t) => {
      window.setTimeout(fn, t);
    },
  }, viewer);

  it('should schedule frames using the polyfill', () => {
    let calls = 0;
    vsync.mutate(() => {
      calls++;
    });
    clock.tick(15);
    vsync.mutate(() => {
      calls++;
    });
    expect(calls).to.equal(0);
    clock.tick(1);
    expect(calls).to.equal(2);
    clock.tick(10);
    vsync.mutate(() => {
      calls++;
    });
    expect(calls).to.equal(2);
    clock.tick(6);
    expect(calls).to.equal(3);
  });
});
