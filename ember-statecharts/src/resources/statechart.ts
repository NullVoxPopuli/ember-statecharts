import { Resource } from 'ember-resources';
import { tracked } from '@glimmer/tracking';
import { registerDestructor } from '@ember/destroyable';
import { action } from '@ember/object';
import { getOwner } from '@ember/application';
import { later, cancel } from '@ember/runloop';
import {
  Event,
  EventData,
  interpret,
  SCXML,
  SingleOrArray,
  StateFrom,
  StateValueFrom,
} from 'xstate';
import type {
  AreAllImplementationsAssumedToBeProvided,
  Interpreter,
  StateMachine,
  EventObject,
  Typestate,
  ResolveTypegenMeta,
  StateSchema,
  TypegenDisabled,
  NoInfer,
  BaseActionObject,
  ServiceMap,
  InterpreterOptions,
} from 'xstate';

import type Owner from '@ember/owner';

import type { ExpandArgs } from 'ember-resources';

interface StatechartArgs<
  TContext,
  TStateSchema extends StateSchema,
  TEvent extends EventObject,
  TAction extends BaseActionObject,
  TServiceMap extends ServiceMap,
  TTypestate extends Typestate<TContext> = {
    value: any;
    context: TContext;
  },
  TResolvedTypesMeta = ResolveTypegenMeta<
    TypegenDisabled,
    NoInfer<TEvent>,
    TAction,
    TServiceMap
  >
> {
  positional: [];
  named: {
    machine: AreAllImplementationsAssumedToBeProvided<TResolvedTypesMeta> extends true
      ? StateMachine<
          TContext,
          TStateSchema,
          TEvent,
          TTypestate,
          TAction,
          TServiceMap,
          TResolvedTypesMeta
        >
      : 'Some implementations missing';
    update?: (opts: {
      machine: AreAllImplementationsAssumedToBeProvided<TResolvedTypesMeta> extends true
        ? StateMachine<
            TContext,
            TStateSchema,
            TEvent,
            TTypestate,
            TAction,
            TServiceMap,
            TResolvedTypesMeta
          >
        : 'Some implementations missing';
      restart: () => void;
      send: Interpreter<
        TContext,
        TStateSchema,
        TEvent,
        TTypestate,
        TResolvedTypesMeta
      >['send'];
    }) => void;
    initialState?: StateValueFrom<
      StateMachine<
        TContext,
        TStateSchema,
        TEvent,
        TTypestate,
        TAction,
        TServiceMap,
        TResolvedTypesMeta
      >
    >;
    onTransition?: (
      state: StateFrom<
        StateMachine<
          TContext,
          TStateSchema,
          TEvent,
          TTypestate,
          TAction,
          TServiceMap,
          TResolvedTypesMeta
        >
      >
    ) => void;
    interpreterOptions?: InterpreterOptions;
  };
}

export class Statechart<
  TContext,
  TStateSchema extends StateSchema,
  TEvent extends EventObject,
  TAction extends BaseActionObject,
  TServiceMap extends ServiceMap,
  TTypestate extends Typestate<TContext> = {
    value: any;
    context: TContext;
  },
  TResolvedTypesMeta = ResolveTypegenMeta<
    TypegenDisabled,
    NoInfer<TEvent>,
    TAction,
    TServiceMap
  >
> extends Resource<
  StatechartArgs<
    TContext,
    TStateSchema,
    TEvent,
    TAction,
    TServiceMap,
    TTypestate,
    TResolvedTypesMeta
  >
> {
  @tracked state:
    | StateFrom<
        StateMachine<
          TContext,
          TStateSchema,
          TEvent,
          TTypestate,
          TAction,
          TServiceMap,
          TResolvedTypesMeta
        >
      >
    | undefined;

  #interpreter:
    | Interpreter<
        TContext,
        TStateSchema,
        TEvent,
        TTypestate,
        TResolvedTypesMeta
      >
    | undefined;

  #interpreters: Array<
    Interpreter<TContext, TStateSchema, TEvent, TTypestate, TResolvedTypesMeta>
  > = [];

  constructor(owner: Owner | unknown) {
    super(owner);

    // cleanup interpreter
    registerDestructor(this, () => this.#interpreter?.stop());
  }

  get config() {
    const owner = getOwner(this);
    if (owner) {
      // eslint-disable-next-line
      // @ts-ignore
      const config = owner.resolveRegistration('config:environment') as {
        [key: string]: unknown;
      };

      const statechartConfig = config['ember-statecharts'] as {
        runloopClockService: boolean;
      };

      if (statechartConfig) {
        return statechartConfig;
      }
    }
    return {
      runloopClockService: false,
    };
  }

  get _defaultInterpreterOptions() {
    if (this.config.runloopClockService) {
      return <InterpreterOptions>{
        clock: {
          setTimeout(fn, timeout) {
            later(fn, timeout);
          },
          clearTimeout(id) {
            cancel(id);
          },
        },
      };
    } else {
      return <InterpreterOptions>{};
    }
  }

  modify(
    positional: [],
    named: ExpandArgs<
      StatechartArgs<
        TContext,
        TStateSchema,
        TEvent,
        TAction,
        TServiceMap,
        TTypestate,
        TResolvedTypesMeta
      >
    >['Named']
  ): void {
    if (!this.#interpreter) {
      this._setupInterpreter(named);
    } else {
      if (named.update) {
        named.update.call(null, {
          machine: named.machine,
          restart: (initialState?: typeof named['initialState']) => {
            const opts = {
              ...named,
            };

            if (initialState) {
              opts.initialState = initialState;
            }

            this._setupInterpreter(opts);
          },
          send: this.#interpreter.send,
        });
      }
    }
  }

  @action send(
    event: SCXML.Event<TEvent> | SingleOrArray<Event<TEvent>>,
    payload?: EventData | undefined
  ) {
    return this.#interpreter?.send(event, payload);
  }

  _setupInterpreter(
    named: ExpandArgs<
      StatechartArgs<
        TContext,
        TStateSchema,
        TEvent,
        TAction,
        TServiceMap,
        TTypestate,
        TResolvedTypesMeta
      >
    >['Named']
  ) {
    const { machine, initialState, onTransition, interpreterOptions } = named;

    const _interpreterOptions =
      interpreterOptions || this._defaultInterpreterOptions;

    const interpreter = interpret(machine, {
      ..._interpreterOptions,
    }).onTransition((state) => {
      if (state.changed || state.changed === undefined) {
        this.state = state;
      }
    });

    if (onTransition) {
      interpreter.onTransition(onTransition);
    }

    this.#interpreters = [...this.#interpreters, interpreter];

    interpreter.start(initialState || interpreter.machine.initialState);

    this.#interpreter = interpreter;

    this._stopOldInterpreter();
  }

  _stopOldInterpreter() {
    const beforeLastInterpreter =
      this.#interpreters[this.#interpreters.length - 2];

    if (beforeLastInterpreter) {
      beforeLastInterpreter.stop();
    }
  }
}

export function useMachine<
  TContext,
  TStateSchema extends StateSchema,
  TEvent extends EventObject,
  TAction extends BaseActionObject,
  TServiceMap extends ServiceMap,
  TTypestate extends Typestate<TContext> = {
    value: any;
    context: TContext;
  },
  TResolvedTypesMeta = ResolveTypegenMeta<
    TypegenDisabled,
    NoInfer<TEvent>,
    TAction,
    TServiceMap
  >
>(
  context: unknown,
  options: () => ExpandArgs<
    StatechartArgs<
      TContext,
      TStateSchema,
      TEvent,
      TAction,
      TServiceMap,
      TTypestate,
      TResolvedTypesMeta
    >
  >['Named']
) {
  return Statechart.from<
    Statechart<
      TContext,
      TStateSchema,
      TEvent,
      TAction,
      TServiceMap,
      TTypestate,
      TResolvedTypesMeta
    >
  >(context, options);
}
