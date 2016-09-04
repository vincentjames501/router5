import constants, { errorCodes }  from '../constants';
import transition from '../transition';
import { noop } from '../utils';

export default function withNavigation(router) {
    let cancelCurrentTransition;

    router.navigate = navigate;
    router.navigateToDefault = navigateToDefault;
    router.transitionToState = transitionToState;
    router.cancel = cancel;

    function cancel() {
        if (cancelCurrentTransition) {
            cancelCurrentTransition('navigate');
            cancelCurrentTransition = null;
        }

        return router;
    }

    function navigate(...args) {
        const name = args[0];
        const lastArg = args[args.length - 1];
        const done = typeof lastArg === 'function' ? lastArg : noop;
        const params = typeof args[1] === 'object' ? args[1] : {};
        const opts = typeof args[2] === 'object' ? args[2] : {};

        if (!router.isStarted()) {
            done({ code: errorCodes.ROUTER_NOT_STARTED });
            return;
        }

        const toState = router.buildState(name, params);

        if (!toState) {
            const err = { code: errorCodes.ROUTE_NOT_FOUND };
            done(err);
            router.invokeEventListeners(constants.TRANSITION_ERROR, null, router.getState(), err);
            return;
        }

        toState.path = router.buildPath(name, params);
        const sameStates = router.getState() ? router.areStatesEqual(router.getState(), toState, false) : false;

        // Do not proceed further if states are the same and no reload
        // (no desactivation and no callbacks)
        if (sameStates && !opts.reload) {
            const err = { code: errorCodes.SAME_STATES };
            done(err);
            router.invokeEventListeners(constants.TRANSITION_ERROR, toState, router.getState(), err);
            return;
        }

        const fromState = sameStates ? null : router.getState();

        // Transitio
        return transitionToState(toState, fromState, opts, (err, state) => {
            if (err) {
                if (err.redirect) {
                    const { name, params } = err.redirect;

                    navigate(name, params, { ...opts, reload: true }, done);
                } else {
                    done(err);
                }
            } else {
                router.invokeEventListeners(constants.TRANSITION_SUCCESS, state, fromState, opts);
                done(null, state);
            }
        });
    }

    function navigateToDefault(opts = {}, done = noop) {
        const options = router.getOptions();

        return navigate(options.defaultRoute, options.defaultParams, opts, done);
    }

    function transitionToState(toState, fromState, options = {}, done = noop) {
        cancel();
        router.invokeEventListeners(constants.TRANSITION_START, toState, fromState);

        cancelCurrentTransition = transition(router, toState, fromState, options, (err, state) => {
            cancelCurrentTransition = null;
            state = state || toState;

            if (err) {
                if (err.code === errorCodes.TRANSITION_CANCELLED) {
                    router.invokeEventListeners(constants.TRANSITION_CANCELLED, toState, fromState);
                } else {
                    router.invokeEventListeners(constants.TRANSITION_ERROR, toState, fromState, err);
                }
                done(err);
            } else {
                router.setState(state);
                done(null, state);
            }
        });

        return cancelCurrentTransition;
    }
}
