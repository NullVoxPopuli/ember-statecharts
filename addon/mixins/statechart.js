import Mixin from '@ember/object/mixin';
import StateChart from '../utils/statechart';
import { computed, get, set } from '@ember/object';
import { makeArray } from '@ember/array';

export default Mixin.create({
  states: computed('statechart', function() {
    let [statechart, statechartOptions = {}] = makeArray(get(this, 'statechart'));

    let updateCurrentState = function(newState) {
      set(this, 'currentState', newState);
    }.bind(this);

    let statechartConfiguration = Object.assign(statechart, {
      context: this,
      didChangeState: updateCurrentState
    });

    let _statechart = new StateChart(statechartConfiguration, statechartOptions);

    return _statechart;
  }),

  currentState: computed('states', {
    get() {
      let states = get(this, 'states');

      return states.currentState;
    },
    set(key, value) {
      return value;
    }
  })
});
