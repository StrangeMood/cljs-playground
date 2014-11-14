/**
 * React v0.11.2
 */
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.React=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule AutoFocusMixin
 * @typechecks static-only
 */

"use strict";

var focusNode = _dereq_("./focusNode");

var AutoFocusMixin = {
  componentDidMount: function() {
    if (this.props.autoFocus) {
      focusNode(this.getDOMNode());
    }
  }
};

module.exports = AutoFocusMixin;

},{"./focusNode":106}],2:[function(_dereq_,module,exports){
/**
 * Copyright 2013 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule BeforeInputEventPlugin
 * @typechecks static-only
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPropagators = _dereq_("./EventPropagators");
var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");
var SyntheticInputEvent = _dereq_("./SyntheticInputEvent");

var keyOf = _dereq_("./keyOf");

var canUseTextInputEvent = (
  ExecutionEnvironment.canUseDOM &&
  'TextEvent' in window &&
  !('documentMode' in document || isPresto())
);

/**
 * Opera <= 12 includes TextEvent in window, but does not fire
 * text input events. Rely on keypress instead.
 */
function isPresto() {
  var opera = window.opera;
  return (
    typeof opera === 'object' &&
    typeof opera.version === 'function' &&
    parseInt(opera.version(), 10) <= 12
  );
}

var SPACEBAR_CODE = 32;
var SPACEBAR_CHAR = String.fromCharCode(SPACEBAR_CODE);

var topLevelTypes = EventConstants.topLevelTypes;

// Events and their corresponding property names.
var eventTypes = {
  beforeInput: {
    phasedRegistrationNames: {
      bubbled: keyOf({onBeforeInput: null}),
      captured: keyOf({onBeforeInputCapture: null})
    },
    dependencies: [
      topLevelTypes.topCompositionEnd,
      topLevelTypes.topKeyPress,
      topLevelTypes.topTextInput,
      topLevelTypes.topPaste
    ]
  }
};

// Track characters inserted via keypress and composition events.
var fallbackChars = null;

/**
 * Return whether a native keypress event is assumed to be a command.
 * This is required because Firefox fires `keypress` events for key commands
 * (cut, copy, select-all, etc.) even though no character is inserted.
 */
function isKeypressCommand(nativeEvent) {
  return (
    (nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey) &&
    // ctrlKey && altKey is equivalent to AltGr, and is not a command.
    !(nativeEvent.ctrlKey && nativeEvent.altKey)
  );
}

/**
 * Create an `onBeforeInput` event to match
 * http://www.w3.org/TR/2013/WD-DOM-Level-3-Events-20131105/#events-inputevents.
 *
 * This event plugin is based on the native `textInput` event
 * available in Chrome, Safari, Opera, and IE. This event fires after
 * `onKeyPress` and `onCompositionEnd`, but before `onInput`.
 *
 * `beforeInput` is spec'd but not implemented in any browsers, and
 * the `input` event does not provide any useful information about what has
 * actually been added, contrary to the spec. Thus, `textInput` is the best
 * available event to identify the characters that have actually been inserted
 * into the target node.
 */
var BeforeInputEventPlugin = {

  eventTypes: eventTypes,

  /**
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {

    var chars;

    if (canUseTextInputEvent) {
      switch (topLevelType) {
        case topLevelTypes.topKeyPress:
          /**
           * If native `textInput` events are available, our goal is to make
           * use of them. However, there is a special case: the spacebar key.
           * In Webkit, preventing default on a spacebar `textInput` event
           * cancels character insertion, but it *also* causes the browser
           * to fall back to its default spacebar behavior of scrolling the
           * page.
           *
           * Tracking at:
           * https://code.google.com/p/chromium/issues/detail?id=355103
           *
           * To avoid this issue, use the keypress event as if no `textInput`
           * event is available.
           */
          var which = nativeEvent.which;
          if (which !== SPACEBAR_CODE) {
            return;
          }

          chars = String.fromCharCode(which);
          break;

        case topLevelTypes.topTextInput:
          // Record the characters to be added to the DOM.
          chars = nativeEvent.data;

          // If it's a spacebar character, assume that we have already handled
          // it at the keypress level and bail immediately.
          if (chars === SPACEBAR_CHAR) {
            return;
          }

          // Otherwise, carry on.
          break;

        default:
          // For other native event types, do nothing.
          return;
      }
    } else {
      switch (topLevelType) {
        case topLevelTypes.topPaste:
          // If a paste event occurs after a keypress, throw out the input
          // chars. Paste events should not lead to BeforeInput events.
          fallbackChars = null;
          break;
        case topLevelTypes.topKeyPress:
          /**
           * As of v27, Firefox may fire keypress events even when no character
           * will be inserted. A few possibilities:
           *
           * - `which` is `0`. Arrow keys, Esc key, etc.
           *
           * - `which` is the pressed key code, but no char is available.
           *   Ex: 'AltGr + d` in Polish. There is no modified character for
           *   this key combination and no character is inserted into the
           *   document, but FF fires the keypress for char code `100` anyway.
           *   No `input` event will occur.
           *
           * - `which` is the pressed key code, but a command combination is
           *   being used. Ex: `Cmd+C`. No character is inserted, and no
           *   `input` event will occur.
           */
          if (nativeEvent.which && !isKeypressCommand(nativeEvent)) {
            fallbackChars = String.fromCharCode(nativeEvent.which);
          }
          break;
        case topLevelTypes.topCompositionEnd:
          fallbackChars = nativeEvent.data;
          break;
      }

      // If no changes have occurred to the fallback string, no relevant
      // event has fired and we're done.
      if (fallbackChars === null) {
        return;
      }

      chars = fallbackChars;
    }

    // If no characters are being inserted, no BeforeInput event should
    // be fired.
    if (!chars) {
      return;
    }

    var event = SyntheticInputEvent.getPooled(
      eventTypes.beforeInput,
      topLevelTargetID,
      nativeEvent
    );

    event.data = chars;
    fallbackChars = null;
    EventPropagators.accumulateTwoPhaseDispatches(event);
    return event;
  }
};

module.exports = BeforeInputEventPlugin;

},{"./EventConstants":15,"./EventPropagators":20,"./ExecutionEnvironment":21,"./SyntheticInputEvent":86,"./keyOf":127}],3:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule CSSProperty
 */

"use strict";

/**
 * CSS properties which accept numbers but are not in units of "px".
 */
var isUnitlessNumber = {
  columnCount: true,
  fillOpacity: true,
  flex: true,
  flexGrow: true,
  flexShrink: true,
  fontWeight: true,
  lineClamp: true,
  lineHeight: true,
  opacity: true,
  order: true,
  orphans: true,
  widows: true,
  zIndex: true,
  zoom: true
};

/**
 * @param {string} prefix vendor-specific prefix, eg: Webkit
 * @param {string} key style name, eg: transitionDuration
 * @return {string} style name prefixed with `prefix`, properly camelCased, eg:
 * WebkitTransitionDuration
 */
function prefixKey(prefix, key) {
  return prefix + key.charAt(0).toUpperCase() + key.substring(1);
}

/**
 * Support style names that may come passed in prefixed by adding permutations
 * of vendor prefixes.
 */
var prefixes = ['Webkit', 'ms', 'Moz', 'O'];

// Using Object.keys here, or else the vanilla for-in loop makes IE8 go into an
// infinite loop, because it iterates over the newly added props too.
Object.keys(isUnitlessNumber).forEach(function(prop) {
  prefixes.forEach(function(prefix) {
    isUnitlessNumber[prefixKey(prefix, prop)] = isUnitlessNumber[prop];
  });
});

/**
 * Most style properties can be unset by doing .style[prop] = '' but IE8
 * doesn't like doing that with shorthand properties so for the properties that
 * IE8 breaks on, which are listed here, we instead unset each of the
 * individual properties. See http://bugs.jquery.com/ticket/12385.
 * The 4-value 'clock' properties like margin, padding, border-width seem to
 * behave without any problems. Curiously, list-style works too without any
 * special prodding.
 */
var shorthandPropertyExpansions = {
  background: {
    backgroundImage: true,
    backgroundPosition: true,
    backgroundRepeat: true,
    backgroundColor: true
  },
  border: {
    borderWidth: true,
    borderStyle: true,
    borderColor: true
  },
  borderBottom: {
    borderBottomWidth: true,
    borderBottomStyle: true,
    borderBottomColor: true
  },
  borderLeft: {
    borderLeftWidth: true,
    borderLeftStyle: true,
    borderLeftColor: true
  },
  borderRight: {
    borderRightWidth: true,
    borderRightStyle: true,
    borderRightColor: true
  },
  borderTop: {
    borderTopWidth: true,
    borderTopStyle: true,
    borderTopColor: true
  },
  font: {
    fontStyle: true,
    fontVariant: true,
    fontWeight: true,
    fontSize: true,
    lineHeight: true,
    fontFamily: true
  }
};

var CSSProperty = {
  isUnitlessNumber: isUnitlessNumber,
  shorthandPropertyExpansions: shorthandPropertyExpansions
};

module.exports = CSSProperty;

},{}],4:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule CSSPropertyOperations
 * @typechecks static-only
 */

"use strict";

var CSSProperty = _dereq_("./CSSProperty");

var dangerousStyleValue = _dereq_("./dangerousStyleValue");
var hyphenateStyleName = _dereq_("./hyphenateStyleName");
var memoizeStringOnly = _dereq_("./memoizeStringOnly");

var processStyleName = memoizeStringOnly(function(styleName) {
  return hyphenateStyleName(styleName);
});

/**
 * Operations for dealing with CSS properties.
 */
var CSSPropertyOperations = {

  /**
   * Serializes a mapping of style properties for use as inline styles:
   *
   *   > createMarkupForStyles({width: '200px', height: 0})
   *   "width:200px;height:0;"
   *
   * Undefined values are ignored so that declarative programming is easier.
   * The result should be HTML-escaped before insertion into the DOM.
   *
   * @param {object} styles
   * @return {?string}
   */
  createMarkupForStyles: function(styles) {
    var serialized = '';
    for (var styleName in styles) {
      if (!styles.hasOwnProperty(styleName)) {
        continue;
      }
      var styleValue = styles[styleName];
      if (styleValue != null) {
        serialized += processStyleName(styleName) + ':';
        serialized += dangerousStyleValue(styleName, styleValue) + ';';
      }
    }
    return serialized || null;
  },

  /**
   * Sets the value for multiple styles on a node.  If a value is specified as
   * '' (empty string), the corresponding style property will be unset.
   *
   * @param {DOMElement} node
   * @param {object} styles
   */
  setValueForStyles: function(node, styles) {
    var style = node.style;
    for (var styleName in styles) {
      if (!styles.hasOwnProperty(styleName)) {
        continue;
      }
      var styleValue = dangerousStyleValue(styleName, styles[styleName]);
      if (styleValue) {
        style[styleName] = styleValue;
      } else {
        var expansion = CSSProperty.shorthandPropertyExpansions[styleName];
        if (expansion) {
          // Shorthand property that IE8 won't like unsetting, so unset each
          // component to placate it
          for (var individualStyleName in expansion) {
            style[individualStyleName] = '';
          }
        } else {
          style[styleName] = '';
        }
      }
    }
  }

};

module.exports = CSSPropertyOperations;

},{"./CSSProperty":3,"./dangerousStyleValue":101,"./hyphenateStyleName":118,"./memoizeStringOnly":129}],5:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule CallbackQueue
 */

"use strict";

var PooledClass = _dereq_("./PooledClass");

var invariant = _dereq_("./invariant");
var mixInto = _dereq_("./mixInto");

/**
 * A specialized pseudo-event module to help keep track of components waiting to
 * be notified when their DOM representations are available for use.
 *
 * This implements `PooledClass`, so you should never need to instantiate this.
 * Instead, use `CallbackQueue.getPooled()`.
 *
 * @class ReactMountReady
 * @implements PooledClass
 * @internal
 */
function CallbackQueue() {
  this._callbacks = null;
  this._contexts = null;
}

mixInto(CallbackQueue, {

  /**
   * Enqueues a callback to be invoked when `notifyAll` is invoked.
   *
   * @param {function} callback Invoked when `notifyAll` is invoked.
   * @param {?object} context Context to call `callback` with.
   * @internal
   */
  enqueue: function(callback, context) {
    this._callbacks = this._callbacks || [];
    this._contexts = this._contexts || [];
    this._callbacks.push(callback);
    this._contexts.push(context);
  },

  /**
   * Invokes all enqueued callbacks and clears the queue. This is invoked after
   * the DOM representation of a component has been created or updated.
   *
   * @internal
   */
  notifyAll: function() {
    var callbacks = this._callbacks;
    var contexts = this._contexts;
    if (callbacks) {
      ("production" !== "development" ? invariant(
        callbacks.length === contexts.length,
        "Mismatched list of contexts in callback queue"
      ) : invariant(callbacks.length === contexts.length));
      this._callbacks = null;
      this._contexts = null;
      for (var i = 0, l = callbacks.length; i < l; i++) {
        callbacks[i].call(contexts[i]);
      }
      callbacks.length = 0;
      contexts.length = 0;
    }
  },

  /**
   * Resets the internal queue.
   *
   * @internal
   */
  reset: function() {
    this._callbacks = null;
    this._contexts = null;
  },

  /**
   * `PooledClass` looks for this.
   */
  destructor: function() {
    this.reset();
  }

});

PooledClass.addPoolingTo(CallbackQueue);

module.exports = CallbackQueue;

},{"./PooledClass":26,"./invariant":120,"./mixInto":133}],6:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ChangeEventPlugin
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPluginHub = _dereq_("./EventPluginHub");
var EventPropagators = _dereq_("./EventPropagators");
var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");
var ReactUpdates = _dereq_("./ReactUpdates");
var SyntheticEvent = _dereq_("./SyntheticEvent");

var isEventSupported = _dereq_("./isEventSupported");
var isTextInputElement = _dereq_("./isTextInputElement");
var keyOf = _dereq_("./keyOf");

var topLevelTypes = EventConstants.topLevelTypes;

var eventTypes = {
  change: {
    phasedRegistrationNames: {
      bubbled: keyOf({onChange: null}),
      captured: keyOf({onChangeCapture: null})
    },
    dependencies: [
      topLevelTypes.topBlur,
      topLevelTypes.topChange,
      topLevelTypes.topClick,
      topLevelTypes.topFocus,
      topLevelTypes.topInput,
      topLevelTypes.topKeyDown,
      topLevelTypes.topKeyUp,
      topLevelTypes.topSelectionChange
    ]
  }
};

/**
 * For IE shims
 */
var activeElement = null;
var activeElementID = null;
var activeElementValue = null;
var activeElementValueProp = null;

/**
 * SECTION: handle `change` event
 */
function shouldUseChangeEvent(elem) {
  return (
    elem.nodeName === 'SELECT' ||
    (elem.nodeName === 'INPUT' && elem.type === 'file')
  );
}

var doesChangeEventBubble = false;
if (ExecutionEnvironment.canUseDOM) {
  // See `handleChange` comment below
  doesChangeEventBubble = isEventSupported('change') && (
    !('documentMode' in document) || document.documentMode > 8
  );
}

function manualDispatchChangeEvent(nativeEvent) {
  var event = SyntheticEvent.getPooled(
    eventTypes.change,
    activeElementID,
    nativeEvent
  );
  EventPropagators.accumulateTwoPhaseDispatches(event);

  // If change and propertychange bubbled, we'd just bind to it like all the
  // other events and have it go through ReactBrowserEventEmitter. Since it
  // doesn't, we manually listen for the events and so we have to enqueue and
  // process the abstract event manually.
  //
  // Batching is necessary here in order to ensure that all event handlers run
  // before the next rerender (including event handlers attached to ancestor
  // elements instead of directly on the input). Without this, controlled
  // components don't work properly in conjunction with event bubbling because
  // the component is rerendered and the value reverted before all the event
  // handlers can run. See https://github.com/facebook/react/issues/708.
  ReactUpdates.batchedUpdates(runEventInBatch, event);
}

function runEventInBatch(event) {
  EventPluginHub.enqueueEvents(event);
  EventPluginHub.processEventQueue();
}

function startWatchingForChangeEventIE8(target, targetID) {
  activeElement = target;
  activeElementID = targetID;
  activeElement.attachEvent('onchange', manualDispatchChangeEvent);
}

function stopWatchingForChangeEventIE8() {
  if (!activeElement) {
    return;
  }
  activeElement.detachEvent('onchange', manualDispatchChangeEvent);
  activeElement = null;
  activeElementID = null;
}

function getTargetIDForChangeEvent(
    topLevelType,
    topLevelTarget,
    topLevelTargetID) {
  if (topLevelType === topLevelTypes.topChange) {
    return topLevelTargetID;
  }
}
function handleEventsForChangeEventIE8(
    topLevelType,
    topLevelTarget,
    topLevelTargetID) {
  if (topLevelType === topLevelTypes.topFocus) {
    // stopWatching() should be a noop here but we call it just in case we
    // missed a blur event somehow.
    stopWatchingForChangeEventIE8();
    startWatchingForChangeEventIE8(topLevelTarget, topLevelTargetID);
  } else if (topLevelType === topLevelTypes.topBlur) {
    stopWatchingForChangeEventIE8();
  }
}


/**
 * SECTION: handle `input` event
 */
var isInputEventSupported = false;
if (ExecutionEnvironment.canUseDOM) {
  // IE9 claims to support the input event but fails to trigger it when
  // deleting text, so we ignore its input events
  isInputEventSupported = isEventSupported('input') && (
    !('documentMode' in document) || document.documentMode > 9
  );
}

/**
 * (For old IE.) Replacement getter/setter for the `value` property that gets
 * set on the active element.
 */
var newValueProp =  {
  get: function() {
    return activeElementValueProp.get.call(this);
  },
  set: function(val) {
    // Cast to a string so we can do equality checks.
    activeElementValue = '' + val;
    activeElementValueProp.set.call(this, val);
  }
};

/**
 * (For old IE.) Starts tracking propertychange events on the passed-in element
 * and override the value property so that we can distinguish user events from
 * value changes in JS.
 */
function startWatchingForValueChange(target, targetID) {
  activeElement = target;
  activeElementID = targetID;
  activeElementValue = target.value;
  activeElementValueProp = Object.getOwnPropertyDescriptor(
    target.constructor.prototype,
    'value'
  );

  Object.defineProperty(activeElement, 'value', newValueProp);
  activeElement.attachEvent('onpropertychange', handlePropertyChange);
}

/**
 * (For old IE.) Removes the event listeners from the currently-tracked element,
 * if any exists.
 */
function stopWatchingForValueChange() {
  if (!activeElement) {
    return;
  }

  // delete restores the original property definition
  delete activeElement.value;
  activeElement.detachEvent('onpropertychange', handlePropertyChange);

  activeElement = null;
  activeElementID = null;
  activeElementValue = null;
  activeElementValueProp = null;
}

/**
 * (For old IE.) Handles a propertychange event, sending a `change` event if
 * the value of the active element has changed.
 */
function handlePropertyChange(nativeEvent) {
  if (nativeEvent.propertyName !== 'value') {
    return;
  }
  var value = nativeEvent.srcElement.value;
  if (value === activeElementValue) {
    return;
  }
  activeElementValue = value;

  manualDispatchChangeEvent(nativeEvent);
}

/**
 * If a `change` event should be fired, returns the target's ID.
 */
function getTargetIDForInputEvent(
    topLevelType,
    topLevelTarget,
    topLevelTargetID) {
  if (topLevelType === topLevelTypes.topInput) {
    // In modern browsers (i.e., not IE8 or IE9), the input event is exactly
    // what we want so fall through here and trigger an abstract event
    return topLevelTargetID;
  }
}

// For IE8 and IE9.
function handleEventsForInputEventIE(
    topLevelType,
    topLevelTarget,
    topLevelTargetID) {
  if (topLevelType === topLevelTypes.topFocus) {
    // In IE8, we can capture almost all .value changes by adding a
    // propertychange handler and looking for events with propertyName
    // equal to 'value'
    // In IE9, propertychange fires for most input events but is buggy and
    // doesn't fire when text is deleted, but conveniently, selectionchange
    // appears to fire in all of the remaining cases so we catch those and
    // forward the event if the value has changed
    // In either case, we don't want to call the event handler if the value
    // is changed from JS so we redefine a setter for `.value` that updates
    // our activeElementValue variable, allowing us to ignore those changes
    //
    // stopWatching() should be a noop here but we call it just in case we
    // missed a blur event somehow.
    stopWatchingForValueChange();
    startWatchingForValueChange(topLevelTarget, topLevelTargetID);
  } else if (topLevelType === topLevelTypes.topBlur) {
    stopWatchingForValueChange();
  }
}

// For IE8 and IE9.
function getTargetIDForInputEventIE(
    topLevelType,
    topLevelTarget,
    topLevelTargetID) {
  if (topLevelType === topLevelTypes.topSelectionChange ||
      topLevelType === topLevelTypes.topKeyUp ||
      topLevelType === topLevelTypes.topKeyDown) {
    // On the selectionchange event, the target is just document which isn't
    // helpful for us so just check activeElement instead.
    //
    // 99% of the time, keydown and keyup aren't necessary. IE8 fails to fire
    // propertychange on the first input event after setting `value` from a
    // script and fires only keydown, keypress, keyup. Catching keyup usually
    // gets it and catching keydown lets us fire an event for the first
    // keystroke if user does a key repeat (it'll be a little delayed: right
    // before the second keystroke). Other input methods (e.g., paste) seem to
    // fire selectionchange normally.
    if (activeElement && activeElement.value !== activeElementValue) {
      activeElementValue = activeElement.value;
      return activeElementID;
    }
  }
}


/**
 * SECTION: handle `click` event
 */
function shouldUseClickEvent(elem) {
  // Use the `click` event to detect changes to checkbox and radio inputs.
  // This approach works across all browsers, whereas `change` does not fire
  // until `blur` in IE8.
  return (
    elem.nodeName === 'INPUT' &&
    (elem.type === 'checkbox' || elem.type === 'radio')
  );
}

function getTargetIDForClickEvent(
    topLevelType,
    topLevelTarget,
    topLevelTargetID) {
  if (topLevelType === topLevelTypes.topClick) {
    return topLevelTargetID;
  }
}

/**
 * This plugin creates an `onChange` event that normalizes change events
 * across form elements. This event fires at a time when it's possible to
 * change the element's value without seeing a flicker.
 *
 * Supported elements are:
 * - input (see `isTextInputElement`)
 * - textarea
 * - select
 */
var ChangeEventPlugin = {

  eventTypes: eventTypes,

  /**
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {

    var getTargetIDFunc, handleEventFunc;
    if (shouldUseChangeEvent(topLevelTarget)) {
      if (doesChangeEventBubble) {
        getTargetIDFunc = getTargetIDForChangeEvent;
      } else {
        handleEventFunc = handleEventsForChangeEventIE8;
      }
    } else if (isTextInputElement(topLevelTarget)) {
      if (isInputEventSupported) {
        getTargetIDFunc = getTargetIDForInputEvent;
      } else {
        getTargetIDFunc = getTargetIDForInputEventIE;
        handleEventFunc = handleEventsForInputEventIE;
      }
    } else if (shouldUseClickEvent(topLevelTarget)) {
      getTargetIDFunc = getTargetIDForClickEvent;
    }

    if (getTargetIDFunc) {
      var targetID = getTargetIDFunc(
        topLevelType,
        topLevelTarget,
        topLevelTargetID
      );
      if (targetID) {
        var event = SyntheticEvent.getPooled(
          eventTypes.change,
          targetID,
          nativeEvent
        );
        EventPropagators.accumulateTwoPhaseDispatches(event);
        return event;
      }
    }

    if (handleEventFunc) {
      handleEventFunc(
        topLevelType,
        topLevelTarget,
        topLevelTargetID
      );
    }
  }

};

module.exports = ChangeEventPlugin;

},{"./EventConstants":15,"./EventPluginHub":17,"./EventPropagators":20,"./ExecutionEnvironment":21,"./ReactUpdates":76,"./SyntheticEvent":84,"./isEventSupported":121,"./isTextInputElement":123,"./keyOf":127}],7:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ClientReactRootIndex
 * @typechecks
 */

"use strict";

var nextReactRootIndex = 0;

var ClientReactRootIndex = {
  createReactRootIndex: function() {
    return nextReactRootIndex++;
  }
};

module.exports = ClientReactRootIndex;

},{}],8:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule CompositionEventPlugin
 * @typechecks static-only
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPropagators = _dereq_("./EventPropagators");
var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");
var ReactInputSelection = _dereq_("./ReactInputSelection");
var SyntheticCompositionEvent = _dereq_("./SyntheticCompositionEvent");

var getTextContentAccessor = _dereq_("./getTextContentAccessor");
var keyOf = _dereq_("./keyOf");

var END_KEYCODES = [9, 13, 27, 32]; // Tab, Return, Esc, Space
var START_KEYCODE = 229;

var useCompositionEvent = (
  ExecutionEnvironment.canUseDOM &&
  'CompositionEvent' in window
);

// In IE9+, we have access to composition events, but the data supplied
// by the native compositionend event may be incorrect. In Korean, for example,
// the compositionend event contains only one character regardless of
// how many characters have been composed since compositionstart.
// We therefore use the fallback data while still using the native
// events as triggers.
var useFallbackData = (
  !useCompositionEvent ||
  (
    'documentMode' in document &&
    document.documentMode > 8 &&
    document.documentMode <= 11
  )
);

var topLevelTypes = EventConstants.topLevelTypes;
var currentComposition = null;

// Events and their corresponding property names.
var eventTypes = {
  compositionEnd: {
    phasedRegistrationNames: {
      bubbled: keyOf({onCompositionEnd: null}),
      captured: keyOf({onCompositionEndCapture: null})
    },
    dependencies: [
      topLevelTypes.topBlur,
      topLevelTypes.topCompositionEnd,
      topLevelTypes.topKeyDown,
      topLevelTypes.topKeyPress,
      topLevelTypes.topKeyUp,
      topLevelTypes.topMouseDown
    ]
  },
  compositionStart: {
    phasedRegistrationNames: {
      bubbled: keyOf({onCompositionStart: null}),
      captured: keyOf({onCompositionStartCapture: null})
    },
    dependencies: [
      topLevelTypes.topBlur,
      topLevelTypes.topCompositionStart,
      topLevelTypes.topKeyDown,
      topLevelTypes.topKeyPress,
      topLevelTypes.topKeyUp,
      topLevelTypes.topMouseDown
    ]
  },
  compositionUpdate: {
    phasedRegistrationNames: {
      bubbled: keyOf({onCompositionUpdate: null}),
      captured: keyOf({onCompositionUpdateCapture: null})
    },
    dependencies: [
      topLevelTypes.topBlur,
      topLevelTypes.topCompositionUpdate,
      topLevelTypes.topKeyDown,
      topLevelTypes.topKeyPress,
      topLevelTypes.topKeyUp,
      topLevelTypes.topMouseDown
    ]
  }
};

/**
 * Translate native top level events into event types.
 *
 * @param {string} topLevelType
 * @return {object}
 */
function getCompositionEventType(topLevelType) {
  switch (topLevelType) {
    case topLevelTypes.topCompositionStart:
      return eventTypes.compositionStart;
    case topLevelTypes.topCompositionEnd:
      return eventTypes.compositionEnd;
    case topLevelTypes.topCompositionUpdate:
      return eventTypes.compositionUpdate;
  }
}

/**
 * Does our fallback best-guess model think this event signifies that
 * composition has begun?
 *
 * @param {string} topLevelType
 * @param {object} nativeEvent
 * @return {boolean}
 */
function isFallbackStart(topLevelType, nativeEvent) {
  return (
    topLevelType === topLevelTypes.topKeyDown &&
    nativeEvent.keyCode === START_KEYCODE
  );
}

/**
 * Does our fallback mode think that this event is the end of composition?
 *
 * @param {string} topLevelType
 * @param {object} nativeEvent
 * @return {boolean}
 */
function isFallbackEnd(topLevelType, nativeEvent) {
  switch (topLevelType) {
    case topLevelTypes.topKeyUp:
      // Command keys insert or clear IME input.
      return (END_KEYCODES.indexOf(nativeEvent.keyCode) !== -1);
    case topLevelTypes.topKeyDown:
      // Expect IME keyCode on each keydown. If we get any other
      // code we must have exited earlier.
      return (nativeEvent.keyCode !== START_KEYCODE);
    case topLevelTypes.topKeyPress:
    case topLevelTypes.topMouseDown:
    case topLevelTypes.topBlur:
      // Events are not possible without cancelling IME.
      return true;
    default:
      return false;
  }
}

/**
 * Helper class stores information about selection and document state
 * so we can figure out what changed at a later date.
 *
 * @param {DOMEventTarget} root
 */
function FallbackCompositionState(root) {
  this.root = root;
  this.startSelection = ReactInputSelection.getSelection(root);
  this.startValue = this.getText();
}

/**
 * Get current text of input.
 *
 * @return {string}
 */
FallbackCompositionState.prototype.getText = function() {
  return this.root.value || this.root[getTextContentAccessor()];
};

/**
 * Text that has changed since the start of composition.
 *
 * @return {string}
 */
FallbackCompositionState.prototype.getData = function() {
  var endValue = this.getText();
  var prefixLength = this.startSelection.start;
  var suffixLength = this.startValue.length - this.startSelection.end;

  return endValue.substr(
    prefixLength,
    endValue.length - suffixLength - prefixLength
  );
};

/**
 * This plugin creates `onCompositionStart`, `onCompositionUpdate` and
 * `onCompositionEnd` events on inputs, textareas and contentEditable
 * nodes.
 */
var CompositionEventPlugin = {

  eventTypes: eventTypes,

  /**
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {

    var eventType;
    var data;

    if (useCompositionEvent) {
      eventType = getCompositionEventType(topLevelType);
    } else if (!currentComposition) {
      if (isFallbackStart(topLevelType, nativeEvent)) {
        eventType = eventTypes.compositionStart;
      }
    } else if (isFallbackEnd(topLevelType, nativeEvent)) {
      eventType = eventTypes.compositionEnd;
    }

    if (useFallbackData) {
      // The current composition is stored statically and must not be
      // overwritten while composition continues.
      if (!currentComposition && eventType === eventTypes.compositionStart) {
        currentComposition = new FallbackCompositionState(topLevelTarget);
      } else if (eventType === eventTypes.compositionEnd) {
        if (currentComposition) {
          data = currentComposition.getData();
          currentComposition = null;
        }
      }
    }

    if (eventType) {
      var event = SyntheticCompositionEvent.getPooled(
        eventType,
        topLevelTargetID,
        nativeEvent
      );
      if (data) {
        // Inject data generated from fallback path into the synthetic event.
        // This matches the property of native CompositionEventInterface.
        event.data = data;
      }
      EventPropagators.accumulateTwoPhaseDispatches(event);
      return event;
    }
  }
};

module.exports = CompositionEventPlugin;

},{"./EventConstants":15,"./EventPropagators":20,"./ExecutionEnvironment":21,"./ReactInputSelection":58,"./SyntheticCompositionEvent":82,"./getTextContentAccessor":115,"./keyOf":127}],9:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule DOMChildrenOperations
 * @typechecks static-only
 */

"use strict";

var Danger = _dereq_("./Danger");
var ReactMultiChildUpdateTypes = _dereq_("./ReactMultiChildUpdateTypes");

var getTextContentAccessor = _dereq_("./getTextContentAccessor");
var invariant = _dereq_("./invariant");

/**
 * The DOM property to use when setting text content.
 *
 * @type {string}
 * @private
 */
var textContentAccessor = getTextContentAccessor();

/**
 * Inserts `childNode` as a child of `parentNode` at the `index`.
 *
 * @param {DOMElement} parentNode Parent node in which to insert.
 * @param {DOMElement} childNode Child node to insert.
 * @param {number} index Index at which to insert the child.
 * @internal
 */
function insertChildAt(parentNode, childNode, index) {
  // By exploiting arrays returning `undefined` for an undefined index, we can
  // rely exclusively on `insertBefore(node, null)` instead of also using
  // `appendChild(node)`. However, using `undefined` is not allowed by all
  // browsers so we must replace it with `null`.
  parentNode.insertBefore(
    childNode,
    parentNode.childNodes[index] || null
  );
}

var updateTextContent;
if (textContentAccessor === 'textContent') {
  /**
   * Sets the text content of `node` to `text`.
   *
   * @param {DOMElement} node Node to change
   * @param {string} text New text content
   */
  updateTextContent = function(node, text) {
    node.textContent = text;
  };
} else {
  /**
   * Sets the text content of `node` to `text`.
   *
   * @param {DOMElement} node Node to change
   * @param {string} text New text content
   */
  updateTextContent = function(node, text) {
    // In order to preserve newlines correctly, we can't use .innerText to set
    // the contents (see #1080), so we empty the element then append a text node
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    if (text) {
      var doc = node.ownerDocument || document;
      node.appendChild(doc.createTextNode(text));
    }
  };
}

/**
 * Operations for updating with DOM children.
 */
var DOMChildrenOperations = {

  dangerouslyReplaceNodeWithMarkup: Danger.dangerouslyReplaceNodeWithMarkup,

  updateTextContent: updateTextContent,

  /**
   * Updates a component's children by processing a series of updates. The
   * update configurations are each expected to have a `parentNode` property.
   *
   * @param {array<object>} updates List of update configurations.
   * @param {array<string>} markupList List of markup strings.
   * @internal
   */
  processUpdates: function(updates, markupList) {
    var update;
    // Mapping from parent IDs to initial child orderings.
    var initialChildren = null;
    // List of children that will be moved or removed.
    var updatedChildren = null;

    for (var i = 0; update = updates[i]; i++) {
      if (update.type === ReactMultiChildUpdateTypes.MOVE_EXISTING ||
          update.type === ReactMultiChildUpdateTypes.REMOVE_NODE) {
        var updatedIndex = update.fromIndex;
        var updatedChild = update.parentNode.childNodes[updatedIndex];
        var parentID = update.parentID;

        ("production" !== "development" ? invariant(
          updatedChild,
          'processUpdates(): Unable to find child %s of element. This ' +
          'probably means the DOM was unexpectedly mutated (e.g., by the ' +
          'browser), usually due to forgetting a <tbody> when using tables, ' +
          'nesting <p> or <a> tags, or using non-SVG elements in an <svg> '+
          'parent. Try inspecting the child nodes of the element with React ' +
          'ID `%s`.',
          updatedIndex,
          parentID
        ) : invariant(updatedChild));

        initialChildren = initialChildren || {};
        initialChildren[parentID] = initialChildren[parentID] || [];
        initialChildren[parentID][updatedIndex] = updatedChild;

        updatedChildren = updatedChildren || [];
        updatedChildren.push(updatedChild);
      }
    }

    var renderedMarkup = Danger.dangerouslyRenderMarkup(markupList);

    // Remove updated children first so that `toIndex` is consistent.
    if (updatedChildren) {
      for (var j = 0; j < updatedChildren.length; j++) {
        updatedChildren[j].parentNode.removeChild(updatedChildren[j]);
      }
    }

    for (var k = 0; update = updates[k]; k++) {
      switch (update.type) {
        case ReactMultiChildUpdateTypes.INSERT_MARKUP:
          insertChildAt(
            update.parentNode,
            renderedMarkup[update.markupIndex],
            update.toIndex
          );
          break;
        case ReactMultiChildUpdateTypes.MOVE_EXISTING:
          insertChildAt(
            update.parentNode,
            initialChildren[update.parentID][update.fromIndex],
            update.toIndex
          );
          break;
        case ReactMultiChildUpdateTypes.TEXT_CONTENT:
          updateTextContent(
            update.parentNode,
            update.textContent
          );
          break;
        case ReactMultiChildUpdateTypes.REMOVE_NODE:
          // Already removed by the for-loop above.
          break;
      }
    }
  }

};

module.exports = DOMChildrenOperations;

},{"./Danger":12,"./ReactMultiChildUpdateTypes":63,"./getTextContentAccessor":115,"./invariant":120}],10:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule DOMProperty
 * @typechecks static-only
 */

/*jslint bitwise: true */

"use strict";

var invariant = _dereq_("./invariant");

var DOMPropertyInjection = {
  /**
   * Mapping from normalized, camelcased property names to a configuration that
   * specifies how the associated DOM property should be accessed or rendered.
   */
  MUST_USE_ATTRIBUTE: 0x1,
  MUST_USE_PROPERTY: 0x2,
  HAS_SIDE_EFFECTS: 0x4,
  HAS_BOOLEAN_VALUE: 0x8,
  HAS_NUMERIC_VALUE: 0x10,
  HAS_POSITIVE_NUMERIC_VALUE: 0x20 | 0x10,
  HAS_OVERLOADED_BOOLEAN_VALUE: 0x40,

  /**
   * Inject some specialized knowledge about the DOM. This takes a config object
   * with the following properties:
   *
   * isCustomAttribute: function that given an attribute name will return true
   * if it can be inserted into the DOM verbatim. Useful for data-* or aria-*
   * attributes where it's impossible to enumerate all of the possible
   * attribute names,
   *
   * Properties: object mapping DOM property name to one of the
   * DOMPropertyInjection constants or null. If your attribute isn't in here,
   * it won't get written to the DOM.
   *
   * DOMAttributeNames: object mapping React attribute name to the DOM
   * attribute name. Attribute names not specified use the **lowercase**
   * normalized name.
   *
   * DOMPropertyNames: similar to DOMAttributeNames but for DOM properties.
   * Property names not specified use the normalized name.
   *
   * DOMMutationMethods: Properties that require special mutation methods. If
   * `value` is undefined, the mutation method should unset the property.
   *
   * @param {object} domPropertyConfig the config as described above.
   */
  injectDOMPropertyConfig: function(domPropertyConfig) {
    var Properties = domPropertyConfig.Properties || {};
    var DOMAttributeNames = domPropertyConfig.DOMAttributeNames || {};
    var DOMPropertyNames = domPropertyConfig.DOMPropertyNames || {};
    var DOMMutationMethods = domPropertyConfig.DOMMutationMethods || {};

    if (domPropertyConfig.isCustomAttribute) {
      DOMProperty._isCustomAttributeFunctions.push(
        domPropertyConfig.isCustomAttribute
      );
    }

    for (var propName in Properties) {
      ("production" !== "development" ? invariant(
        !DOMProperty.isStandardName.hasOwnProperty(propName),
        'injectDOMPropertyConfig(...): You\'re trying to inject DOM property ' +
        '\'%s\' which has already been injected. You may be accidentally ' +
        'injecting the same DOM property config twice, or you may be ' +
        'injecting two configs that have conflicting property names.',
        propName
      ) : invariant(!DOMProperty.isStandardName.hasOwnProperty(propName)));

      DOMProperty.isStandardName[propName] = true;

      var lowerCased = propName.toLowerCase();
      DOMProperty.getPossibleStandardName[lowerCased] = propName;

      if (DOMAttributeNames.hasOwnProperty(propName)) {
        var attributeName = DOMAttributeNames[propName];
        DOMProperty.getPossibleStandardName[attributeName] = propName;
        DOMProperty.getAttributeName[propName] = attributeName;
      } else {
        DOMProperty.getAttributeName[propName] = lowerCased;
      }

      DOMProperty.getPropertyName[propName] =
        DOMPropertyNames.hasOwnProperty(propName) ?
          DOMPropertyNames[propName] :
          propName;

      if (DOMMutationMethods.hasOwnProperty(propName)) {
        DOMProperty.getMutationMethod[propName] = DOMMutationMethods[propName];
      } else {
        DOMProperty.getMutationMethod[propName] = null;
      }

      var propConfig = Properties[propName];
      DOMProperty.mustUseAttribute[propName] =
        propConfig & DOMPropertyInjection.MUST_USE_ATTRIBUTE;
      DOMProperty.mustUseProperty[propName] =
        propConfig & DOMPropertyInjection.MUST_USE_PROPERTY;
      DOMProperty.hasSideEffects[propName] =
        propConfig & DOMPropertyInjection.HAS_SIDE_EFFECTS;
      DOMProperty.hasBooleanValue[propName] =
        propConfig & DOMPropertyInjection.HAS_BOOLEAN_VALUE;
      DOMProperty.hasNumericValue[propName] =
        propConfig & DOMPropertyInjection.HAS_NUMERIC_VALUE;
      DOMProperty.hasPositiveNumericValue[propName] =
        propConfig & DOMPropertyInjection.HAS_POSITIVE_NUMERIC_VALUE;
      DOMProperty.hasOverloadedBooleanValue[propName] =
        propConfig & DOMPropertyInjection.HAS_OVERLOADED_BOOLEAN_VALUE;

      ("production" !== "development" ? invariant(
        !DOMProperty.mustUseAttribute[propName] ||
          !DOMProperty.mustUseProperty[propName],
        'DOMProperty: Cannot require using both attribute and property: %s',
        propName
      ) : invariant(!DOMProperty.mustUseAttribute[propName] ||
        !DOMProperty.mustUseProperty[propName]));
      ("production" !== "development" ? invariant(
        DOMProperty.mustUseProperty[propName] ||
          !DOMProperty.hasSideEffects[propName],
        'DOMProperty: Properties that have side effects must use property: %s',
        propName
      ) : invariant(DOMProperty.mustUseProperty[propName] ||
        !DOMProperty.hasSideEffects[propName]));
      ("production" !== "development" ? invariant(
        !!DOMProperty.hasBooleanValue[propName] +
          !!DOMProperty.hasNumericValue[propName] +
          !!DOMProperty.hasOverloadedBooleanValue[propName] <= 1,
        'DOMProperty: Value can be one of boolean, overloaded boolean, or ' +
        'numeric value, but not a combination: %s',
        propName
      ) : invariant(!!DOMProperty.hasBooleanValue[propName] +
        !!DOMProperty.hasNumericValue[propName] +
        !!DOMProperty.hasOverloadedBooleanValue[propName] <= 1));
    }
  }
};
var defaultValueCache = {};

/**
 * DOMProperty exports lookup objects that can be used like functions:
 *
 *   > DOMProperty.isValid['id']
 *   true
 *   > DOMProperty.isValid['foobar']
 *   undefined
 *
 * Although this may be confusing, it performs better in general.
 *
 * @see http://jsperf.com/key-exists
 * @see http://jsperf.com/key-missing
 */
var DOMProperty = {

  ID_ATTRIBUTE_NAME: 'data-reactid',

  /**
   * Checks whether a property name is a standard property.
   * @type {Object}
   */
  isStandardName: {},

  /**
   * Mapping from lowercase property names to the properly cased version, used
   * to warn in the case of missing properties.
   * @type {Object}
   */
  getPossibleStandardName: {},

  /**
   * Mapping from normalized names to attribute names that differ. Attribute
   * names are used when rendering markup or with `*Attribute()`.
   * @type {Object}
   */
  getAttributeName: {},

  /**
   * Mapping from normalized names to properties on DOM node instances.
   * (This includes properties that mutate due to external factors.)
   * @type {Object}
   */
  getPropertyName: {},

  /**
   * Mapping from normalized names to mutation methods. This will only exist if
   * mutation cannot be set simply by the property or `setAttribute()`.
   * @type {Object}
   */
  getMutationMethod: {},

  /**
   * Whether the property must be accessed and mutated as an object property.
   * @type {Object}
   */
  mustUseAttribute: {},

  /**
   * Whether the property must be accessed and mutated using `*Attribute()`.
   * (This includes anything that fails `<propName> in <element>`.)
   * @type {Object}
   */
  mustUseProperty: {},

  /**
   * Whether or not setting a value causes side effects such as triggering
   * resources to be loaded or text selection changes. We must ensure that
   * the value is only set if it has changed.
   * @type {Object}
   */
  hasSideEffects: {},

  /**
   * Whether the property should be removed when set to a falsey value.
   * @type {Object}
   */
  hasBooleanValue: {},

  /**
   * Whether the property must be numeric or parse as a
   * numeric and should be removed when set to a falsey value.
   * @type {Object}
   */
  hasNumericValue: {},

  /**
   * Whether the property must be positive numeric or parse as a positive
   * numeric and should be removed when set to a falsey value.
   * @type {Object}
   */
  hasPositiveNumericValue: {},

  /**
   * Whether the property can be used as a flag as well as with a value. Removed
   * when strictly equal to false; present without a value when strictly equal
   * to true; present with a value otherwise.
   * @type {Object}
   */
  hasOverloadedBooleanValue: {},

  /**
   * All of the isCustomAttribute() functions that have been injected.
   */
  _isCustomAttributeFunctions: [],

  /**
   * Checks whether a property name is a custom attribute.
   * @method
   */
  isCustomAttribute: function(attributeName) {
    for (var i = 0; i < DOMProperty._isCustomAttributeFunctions.length; i++) {
      var isCustomAttributeFn = DOMProperty._isCustomAttributeFunctions[i];
      if (isCustomAttributeFn(attributeName)) {
        return true;
      }
    }
    return false;
  },

  /**
   * Returns the default property value for a DOM property (i.e., not an
   * attribute). Most default values are '' or false, but not all. Worse yet,
   * some (in particular, `type`) vary depending on the type of element.
   *
   * TODO: Is it better to grab all the possible properties when creating an
   * element to avoid having to create the same element twice?
   */
  getDefaultValueForProperty: function(nodeName, prop) {
    var nodeDefaults = defaultValueCache[nodeName];
    var testElement;
    if (!nodeDefaults) {
      defaultValueCache[nodeName] = nodeDefaults = {};
    }
    if (!(prop in nodeDefaults)) {
      testElement = document.createElement(nodeName);
      nodeDefaults[prop] = testElement[prop];
    }
    return nodeDefaults[prop];
  },

  injection: DOMPropertyInjection
};

module.exports = DOMProperty;

},{"./invariant":120}],11:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule DOMPropertyOperations
 * @typechecks static-only
 */

"use strict";

var DOMProperty = _dereq_("./DOMProperty");

var escapeTextForBrowser = _dereq_("./escapeTextForBrowser");
var memoizeStringOnly = _dereq_("./memoizeStringOnly");
var warning = _dereq_("./warning");

function shouldIgnoreValue(name, value) {
  return value == null ||
    (DOMProperty.hasBooleanValue[name] && !value) ||
    (DOMProperty.hasNumericValue[name] && isNaN(value)) ||
    (DOMProperty.hasPositiveNumericValue[name] && (value < 1)) ||
    (DOMProperty.hasOverloadedBooleanValue[name] && value === false);
}

var processAttributeNameAndPrefix = memoizeStringOnly(function(name) {
  return escapeTextForBrowser(name) + '="';
});

if ("production" !== "development") {
  var reactProps = {
    children: true,
    dangerouslySetInnerHTML: true,
    key: true,
    ref: true
  };
  var warnedProperties = {};

  var warnUnknownProperty = function(name) {
    if (reactProps.hasOwnProperty(name) && reactProps[name] ||
        warnedProperties.hasOwnProperty(name) && warnedProperties[name]) {
      return;
    }

    warnedProperties[name] = true;
    var lowerCasedName = name.toLowerCase();

    // data-* attributes should be lowercase; suggest the lowercase version
    var standardName = (
      DOMProperty.isCustomAttribute(lowerCasedName) ?
        lowerCasedName :
      DOMProperty.getPossibleStandardName.hasOwnProperty(lowerCasedName) ?
        DOMProperty.getPossibleStandardName[lowerCasedName] :
        null
    );

    // For now, only warn when we have a suggested correction. This prevents
    // logging too much when using transferPropsTo.
    ("production" !== "development" ? warning(
      standardName == null,
      'Unknown DOM property ' + name + '. Did you mean ' + standardName + '?'
    ) : null);

  };
}

/**
 * Operations for dealing with DOM properties.
 */
var DOMPropertyOperations = {

  /**
   * Creates markup for the ID property.
   *
   * @param {string} id Unescaped ID.
   * @return {string} Markup string.
   */
  createMarkupForID: function(id) {
    return processAttributeNameAndPrefix(DOMProperty.ID_ATTRIBUTE_NAME) +
      escapeTextForBrowser(id) + '"';
  },

  /**
   * Creates markup for a property.
   *
   * @param {string} name
   * @param {*} value
   * @return {?string} Markup string, or null if the property was invalid.
   */
  createMarkupForProperty: function(name, value) {
    if (DOMProperty.isStandardName.hasOwnProperty(name) &&
        DOMProperty.isStandardName[name]) {
      if (shouldIgnoreValue(name, value)) {
        return '';
      }
      var attributeName = DOMProperty.getAttributeName[name];
      if (DOMProperty.hasBooleanValue[name] ||
          (DOMProperty.hasOverloadedBooleanValue[name] && value === true)) {
        return escapeTextForBrowser(attributeName);
      }
      return processAttributeNameAndPrefix(attributeName) +
        escapeTextForBrowser(value) + '"';
    } else if (DOMProperty.isCustomAttribute(name)) {
      if (value == null) {
        return '';
      }
      return processAttributeNameAndPrefix(name) +
        escapeTextForBrowser(value) + '"';
    } else if ("production" !== "development") {
      warnUnknownProperty(name);
    }
    return null;
  },

  /**
   * Sets the value for a property on a node.
   *
   * @param {DOMElement} node
   * @param {string} name
   * @param {*} value
   */
  setValueForProperty: function(node, name, value) {
    if (DOMProperty.isStandardName.hasOwnProperty(name) &&
        DOMProperty.isStandardName[name]) {
      var mutationMethod = DOMProperty.getMutationMethod[name];
      if (mutationMethod) {
        mutationMethod(node, value);
      } else if (shouldIgnoreValue(name, value)) {
        this.deleteValueForProperty(node, name);
      } else if (DOMProperty.mustUseAttribute[name]) {
        node.setAttribute(DOMProperty.getAttributeName[name], '' + value);
      } else {
        var propName = DOMProperty.getPropertyName[name];
        if (!DOMProperty.hasSideEffects[name] || node[propName] !== value) {
          node[propName] = value;
        }
      }
    } else if (DOMProperty.isCustomAttribute(name)) {
      if (value == null) {
        node.removeAttribute(name);
      } else {
        node.setAttribute(name, '' + value);
      }
    } else if ("production" !== "development") {
      warnUnknownProperty(name);
    }
  },

  /**
   * Deletes the value for a property on a node.
   *
   * @param {DOMElement} node
   * @param {string} name
   */
  deleteValueForProperty: function(node, name) {
    if (DOMProperty.isStandardName.hasOwnProperty(name) &&
        DOMProperty.isStandardName[name]) {
      var mutationMethod = DOMProperty.getMutationMethod[name];
      if (mutationMethod) {
        mutationMethod(node, undefined);
      } else if (DOMProperty.mustUseAttribute[name]) {
        node.removeAttribute(DOMProperty.getAttributeName[name]);
      } else {
        var propName = DOMProperty.getPropertyName[name];
        var defaultValue = DOMProperty.getDefaultValueForProperty(
          node.nodeName,
          propName
        );
        if (!DOMProperty.hasSideEffects[name] ||
            node[propName] !== defaultValue) {
          node[propName] = defaultValue;
        }
      }
    } else if (DOMProperty.isCustomAttribute(name)) {
      node.removeAttribute(name);
    } else if ("production" !== "development") {
      warnUnknownProperty(name);
    }
  }

};

module.exports = DOMPropertyOperations;

},{"./DOMProperty":10,"./escapeTextForBrowser":104,"./memoizeStringOnly":129,"./warning":143}],12:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule Danger
 * @typechecks static-only
 */

/*jslint evil: true, sub: true */

"use strict";

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var createNodesFromMarkup = _dereq_("./createNodesFromMarkup");
var emptyFunction = _dereq_("./emptyFunction");
var getMarkupWrap = _dereq_("./getMarkupWrap");
var invariant = _dereq_("./invariant");

var OPEN_TAG_NAME_EXP = /^(<[^ \/>]+)/;
var RESULT_INDEX_ATTR = 'data-danger-index';

/**
 * Extracts the `nodeName` from a string of markup.
 *
 * NOTE: Extracting the `nodeName` does not require a regular expression match
 * because we make assumptions about React-generated markup (i.e. there are no
 * spaces surrounding the opening tag and there is at least one attribute).
 *
 * @param {string} markup String of markup.
 * @return {string} Node name of the supplied markup.
 * @see http://jsperf.com/extract-nodename
 */
function getNodeName(markup) {
  return markup.substring(1, markup.indexOf(' '));
}

var Danger = {

  /**
   * Renders markup into an array of nodes. The markup is expected to render
   * into a list of root nodes. Also, the length of `resultList` and
   * `markupList` should be the same.
   *
   * @param {array<string>} markupList List of markup strings to render.
   * @return {array<DOMElement>} List of rendered nodes.
   * @internal
   */
  dangerouslyRenderMarkup: function(markupList) {
    ("production" !== "development" ? invariant(
      ExecutionEnvironment.canUseDOM,
      'dangerouslyRenderMarkup(...): Cannot render markup in a Worker ' +
      'thread. This is likely a bug in the framework. Please report ' +
      'immediately.'
    ) : invariant(ExecutionEnvironment.canUseDOM));
    var nodeName;
    var markupByNodeName = {};
    // Group markup by `nodeName` if a wrap is necessary, else by '*'.
    for (var i = 0; i < markupList.length; i++) {
      ("production" !== "development" ? invariant(
        markupList[i],
        'dangerouslyRenderMarkup(...): Missing markup.'
      ) : invariant(markupList[i]));
      nodeName = getNodeName(markupList[i]);
      nodeName = getMarkupWrap(nodeName) ? nodeName : '*';
      markupByNodeName[nodeName] = markupByNodeName[nodeName] || [];
      markupByNodeName[nodeName][i] = markupList[i];
    }
    var resultList = [];
    var resultListAssignmentCount = 0;
    for (nodeName in markupByNodeName) {
      if (!markupByNodeName.hasOwnProperty(nodeName)) {
        continue;
      }
      var markupListByNodeName = markupByNodeName[nodeName];

      // This for-in loop skips the holes of the sparse array. The order of
      // iteration should follow the order of assignment, which happens to match
      // numerical index order, but we don't rely on that.
      for (var resultIndex in markupListByNodeName) {
        if (markupListByNodeName.hasOwnProperty(resultIndex)) {
          var markup = markupListByNodeName[resultIndex];

          // Push the requested markup with an additional RESULT_INDEX_ATTR
          // attribute.  If the markup does not start with a < character, it
          // will be discarded below (with an appropriate console.error).
          markupListByNodeName[resultIndex] = markup.replace(
            OPEN_TAG_NAME_EXP,
            // This index will be parsed back out below.
            '$1 ' + RESULT_INDEX_ATTR + '="' + resultIndex + '" '
          );
        }
      }

      // Render each group of markup with similar wrapping `nodeName`.
      var renderNodes = createNodesFromMarkup(
        markupListByNodeName.join(''),
        emptyFunction // Do nothing special with <script> tags.
      );

      for (i = 0; i < renderNodes.length; ++i) {
        var renderNode = renderNodes[i];
        if (renderNode.hasAttribute &&
            renderNode.hasAttribute(RESULT_INDEX_ATTR)) {

          resultIndex = +renderNode.getAttribute(RESULT_INDEX_ATTR);
          renderNode.removeAttribute(RESULT_INDEX_ATTR);

          ("production" !== "development" ? invariant(
            !resultList.hasOwnProperty(resultIndex),
            'Danger: Assigning to an already-occupied result index.'
          ) : invariant(!resultList.hasOwnProperty(resultIndex)));

          resultList[resultIndex] = renderNode;

          // This should match resultList.length and markupList.length when
          // we're done.
          resultListAssignmentCount += 1;

        } else if ("production" !== "development") {
          console.error(
            "Danger: Discarding unexpected node:",
            renderNode
          );
        }
      }
    }

    // Although resultList was populated out of order, it should now be a dense
    // array.
    ("production" !== "development" ? invariant(
      resultListAssignmentCount === resultList.length,
      'Danger: Did not assign to every index of resultList.'
    ) : invariant(resultListAssignmentCount === resultList.length));

    ("production" !== "development" ? invariant(
      resultList.length === markupList.length,
      'Danger: Expected markup to render %s nodes, but rendered %s.',
      markupList.length,
      resultList.length
    ) : invariant(resultList.length === markupList.length));

    return resultList;
  },

  /**
   * Replaces a node with a string of markup at its current position within its
   * parent. The markup must render into a single root node.
   *
   * @param {DOMElement} oldChild Child node to replace.
   * @param {string} markup Markup to render in place of the child node.
   * @internal
   */
  dangerouslyReplaceNodeWithMarkup: function(oldChild, markup) {
    ("production" !== "development" ? invariant(
      ExecutionEnvironment.canUseDOM,
      'dangerouslyReplaceNodeWithMarkup(...): Cannot render markup in a ' +
      'worker thread. This is likely a bug in the framework. Please report ' +
      'immediately.'
    ) : invariant(ExecutionEnvironment.canUseDOM));
    ("production" !== "development" ? invariant(markup, 'dangerouslyReplaceNodeWithMarkup(...): Missing markup.') : invariant(markup));
    ("production" !== "development" ? invariant(
      oldChild.tagName.toLowerCase() !== 'html',
      'dangerouslyReplaceNodeWithMarkup(...): Cannot replace markup of the ' +
      '<html> node. This is because browser quirks make this unreliable ' +
      'and/or slow. If you want to render to the root you must use ' +
      'server rendering. See renderComponentToString().'
    ) : invariant(oldChild.tagName.toLowerCase() !== 'html'));

    var newChild = createNodesFromMarkup(markup, emptyFunction)[0];
    oldChild.parentNode.replaceChild(newChild, oldChild);
  }

};

module.exports = Danger;

},{"./ExecutionEnvironment":21,"./createNodesFromMarkup":100,"./emptyFunction":102,"./getMarkupWrap":112,"./invariant":120}],13:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule DefaultEventPluginOrder
 */

"use strict";

 var keyOf = _dereq_("./keyOf");

/**
 * Module that is injectable into `EventPluginHub`, that specifies a
 * deterministic ordering of `EventPlugin`s. A convenient way to reason about
 * plugins, without having to package every one of them. This is better than
 * having plugins be ordered in the same order that they are injected because
 * that ordering would be influenced by the packaging order.
 * `ResponderEventPlugin` must occur before `SimpleEventPlugin` so that
 * preventing default on events is convenient in `SimpleEventPlugin` handlers.
 */
var DefaultEventPluginOrder = [
  keyOf({ResponderEventPlugin: null}),
  keyOf({SimpleEventPlugin: null}),
  keyOf({TapEventPlugin: null}),
  keyOf({EnterLeaveEventPlugin: null}),
  keyOf({ChangeEventPlugin: null}),
  keyOf({SelectEventPlugin: null}),
  keyOf({CompositionEventPlugin: null}),
  keyOf({BeforeInputEventPlugin: null}),
  keyOf({AnalyticsEventPlugin: null}),
  keyOf({MobileSafariClickEventPlugin: null})
];

module.exports = DefaultEventPluginOrder;

},{"./keyOf":127}],14:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule EnterLeaveEventPlugin
 * @typechecks static-only
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPropagators = _dereq_("./EventPropagators");
var SyntheticMouseEvent = _dereq_("./SyntheticMouseEvent");

var ReactMount = _dereq_("./ReactMount");
var keyOf = _dereq_("./keyOf");

var topLevelTypes = EventConstants.topLevelTypes;
var getFirstReactDOM = ReactMount.getFirstReactDOM;

var eventTypes = {
  mouseEnter: {
    registrationName: keyOf({onMouseEnter: null}),
    dependencies: [
      topLevelTypes.topMouseOut,
      topLevelTypes.topMouseOver
    ]
  },
  mouseLeave: {
    registrationName: keyOf({onMouseLeave: null}),
    dependencies: [
      topLevelTypes.topMouseOut,
      topLevelTypes.topMouseOver
    ]
  }
};

var extractedEvents = [null, null];

var EnterLeaveEventPlugin = {

  eventTypes: eventTypes,

  /**
   * For almost every interaction we care about, there will be both a top-level
   * `mouseover` and `mouseout` event that occurs. Only use `mouseout` so that
   * we do not extract duplicate events. However, moving the mouse into the
   * browser from outside will not fire a `mouseout` event. In this case, we use
   * the `mouseover` top-level event.
   *
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {
    if (topLevelType === topLevelTypes.topMouseOver &&
        (nativeEvent.relatedTarget || nativeEvent.fromElement)) {
      return null;
    }
    if (topLevelType !== topLevelTypes.topMouseOut &&
        topLevelType !== topLevelTypes.topMouseOver) {
      // Must not be a mouse in or mouse out - ignoring.
      return null;
    }

    var win;
    if (topLevelTarget.window === topLevelTarget) {
      // `topLevelTarget` is probably a window object.
      win = topLevelTarget;
    } else {
      // TODO: Figure out why `ownerDocument` is sometimes undefined in IE8.
      var doc = topLevelTarget.ownerDocument;
      if (doc) {
        win = doc.defaultView || doc.parentWindow;
      } else {
        win = window;
      }
    }

    var from, to;
    if (topLevelType === topLevelTypes.topMouseOut) {
      from = topLevelTarget;
      to =
        getFirstReactDOM(nativeEvent.relatedTarget || nativeEvent.toElement) ||
        win;
    } else {
      from = win;
      to = topLevelTarget;
    }

    if (from === to) {
      // Nothing pertains to our managed components.
      return null;
    }

    var fromID = from ? ReactMount.getID(from) : '';
    var toID = to ? ReactMount.getID(to) : '';

    var leave = SyntheticMouseEvent.getPooled(
      eventTypes.mouseLeave,
      fromID,
      nativeEvent
    );
    leave.type = 'mouseleave';
    leave.target = from;
    leave.relatedTarget = to;

    var enter = SyntheticMouseEvent.getPooled(
      eventTypes.mouseEnter,
      toID,
      nativeEvent
    );
    enter.type = 'mouseenter';
    enter.target = to;
    enter.relatedTarget = from;

    EventPropagators.accumulateEnterLeaveDispatches(leave, enter, fromID, toID);

    extractedEvents[0] = leave;
    extractedEvents[1] = enter;

    return extractedEvents;
  }

};

module.exports = EnterLeaveEventPlugin;

},{"./EventConstants":15,"./EventPropagators":20,"./ReactMount":61,"./SyntheticMouseEvent":88,"./keyOf":127}],15:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule EventConstants
 */

"use strict";

var keyMirror = _dereq_("./keyMirror");

var PropagationPhases = keyMirror({bubbled: null, captured: null});

/**
 * Types of raw signals from the browser caught at the top level.
 */
var topLevelTypes = keyMirror({
  topBlur: null,
  topChange: null,
  topClick: null,
  topCompositionEnd: null,
  topCompositionStart: null,
  topCompositionUpdate: null,
  topContextMenu: null,
  topCopy: null,
  topCut: null,
  topDoubleClick: null,
  topDrag: null,
  topDragEnd: null,
  topDragEnter: null,
  topDragExit: null,
  topDragLeave: null,
  topDragOver: null,
  topDragStart: null,
  topDrop: null,
  topError: null,
  topFocus: null,
  topInput: null,
  topKeyDown: null,
  topKeyPress: null,
  topKeyUp: null,
  topLoad: null,
  topMouseDown: null,
  topMouseMove: null,
  topMouseOut: null,
  topMouseOver: null,
  topMouseUp: null,
  topPaste: null,
  topReset: null,
  topScroll: null,
  topSelectionChange: null,
  topSubmit: null,
  topTextInput: null,
  topTouchCancel: null,
  topTouchEnd: null,
  topTouchMove: null,
  topTouchStart: null,
  topWheel: null
});

var EventConstants = {
  topLevelTypes: topLevelTypes,
  PropagationPhases: PropagationPhases
};

module.exports = EventConstants;

},{"./keyMirror":126}],16:[function(_dereq_,module,exports){
/**
 * @providesModule EventListener
 * @typechecks
 */

var emptyFunction = _dereq_("./emptyFunction");

/**
 * Upstream version of event listener. Does not take into account specific
 * nature of platform.
 */
var EventListener = {
  /**
   * Listen to DOM events during the bubble phase.
   *
   * @param {DOMEventTarget} target DOM element to register listener on.
   * @param {string} eventType Event type, e.g. 'click' or 'mouseover'.
   * @param {function} callback Callback function.
   * @return {object} Object with a `remove` method.
   */
  listen: function(target, eventType, callback) {
    if (target.addEventListener) {
      target.addEventListener(eventType, callback, false);
      return {
        remove: function() {
          target.removeEventListener(eventType, callback, false);
        }
      };
    } else if (target.attachEvent) {
      target.attachEvent('on' + eventType, callback);
      return {
        remove: function() {
          target.detachEvent('on' + eventType, callback);
        }
      };
    }
  },

  /**
   * Listen to DOM events during the capture phase.
   *
   * @param {DOMEventTarget} target DOM element to register listener on.
   * @param {string} eventType Event type, e.g. 'click' or 'mouseover'.
   * @param {function} callback Callback function.
   * @return {object} Object with a `remove` method.
   */
  capture: function(target, eventType, callback) {
    if (!target.addEventListener) {
      if ("production" !== "development") {
        console.error(
          'Attempted to listen to events during the capture phase on a ' +
          'browser that does not support the capture phase. Your application ' +
          'will not receive some events.'
        );
      }
      return {
        remove: emptyFunction
      };
    } else {
      target.addEventListener(eventType, callback, true);
      return {
        remove: function() {
          target.removeEventListener(eventType, callback, true);
        }
      };
    }
  },

  registerDefault: function() {}
};

module.exports = EventListener;

},{"./emptyFunction":102}],17:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule EventPluginHub
 */

"use strict";

var EventPluginRegistry = _dereq_("./EventPluginRegistry");
var EventPluginUtils = _dereq_("./EventPluginUtils");

var accumulate = _dereq_("./accumulate");
var forEachAccumulated = _dereq_("./forEachAccumulated");
var invariant = _dereq_("./invariant");
var isEventSupported = _dereq_("./isEventSupported");
var monitorCodeUse = _dereq_("./monitorCodeUse");

/**
 * Internal store for event listeners
 */
var listenerBank = {};

/**
 * Internal queue of events that have accumulated their dispatches and are
 * waiting to have their dispatches executed.
 */
var eventQueue = null;

/**
 * Dispatches an event and releases it back into the pool, unless persistent.
 *
 * @param {?object} event Synthetic event to be dispatched.
 * @private
 */
var executeDispatchesAndRelease = function(event) {
  if (event) {
    var executeDispatch = EventPluginUtils.executeDispatch;
    // Plugins can provide custom behavior when dispatching events.
    var PluginModule = EventPluginRegistry.getPluginModuleForEvent(event);
    if (PluginModule && PluginModule.executeDispatch) {
      executeDispatch = PluginModule.executeDispatch;
    }
    EventPluginUtils.executeDispatchesInOrder(event, executeDispatch);

    if (!event.isPersistent()) {
      event.constructor.release(event);
    }
  }
};

/**
 * - `InstanceHandle`: [required] Module that performs logical traversals of DOM
 *   hierarchy given ids of the logical DOM elements involved.
 */
var InstanceHandle = null;

function validateInstanceHandle() {
  var invalid = !InstanceHandle||
    !InstanceHandle.traverseTwoPhase ||
    !InstanceHandle.traverseEnterLeave;
  if (invalid) {
    throw new Error('InstanceHandle not injected before use!');
  }
}

/**
 * This is a unified interface for event plugins to be installed and configured.
 *
 * Event plugins can implement the following properties:
 *
 *   `extractEvents` {function(string, DOMEventTarget, string, object): *}
 *     Required. When a top-level event is fired, this method is expected to
 *     extract synthetic events that will in turn be queued and dispatched.
 *
 *   `eventTypes` {object}
 *     Optional, plugins that fire events must publish a mapping of registration
 *     names that are used to register listeners. Values of this mapping must
 *     be objects that contain `registrationName` or `phasedRegistrationNames`.
 *
 *   `executeDispatch` {function(object, function, string)}
 *     Optional, allows plugins to override how an event gets dispatched. By
 *     default, the listener is simply invoked.
 *
 * Each plugin that is injected into `EventsPluginHub` is immediately operable.
 *
 * @public
 */
var EventPluginHub = {

  /**
   * Methods for injecting dependencies.
   */
  injection: {

    /**
     * @param {object} InjectedMount
     * @public
     */
    injectMount: EventPluginUtils.injection.injectMount,

    /**
     * @param {object} InjectedInstanceHandle
     * @public
     */
    injectInstanceHandle: function(InjectedInstanceHandle) {
      InstanceHandle = InjectedInstanceHandle;
      if ("production" !== "development") {
        validateInstanceHandle();
      }
    },

    getInstanceHandle: function() {
      if ("production" !== "development") {
        validateInstanceHandle();
      }
      return InstanceHandle;
    },

    /**
     * @param {array} InjectedEventPluginOrder
     * @public
     */
    injectEventPluginOrder: EventPluginRegistry.injectEventPluginOrder,

    /**
     * @param {object} injectedNamesToPlugins Map from names to plugin modules.
     */
    injectEventPluginsByName: EventPluginRegistry.injectEventPluginsByName

  },

  eventNameDispatchConfigs: EventPluginRegistry.eventNameDispatchConfigs,

  registrationNameModules: EventPluginRegistry.registrationNameModules,

  /**
   * Stores `listener` at `listenerBank[registrationName][id]`. Is idempotent.
   *
   * @param {string} id ID of the DOM element.
   * @param {string} registrationName Name of listener (e.g. `onClick`).
   * @param {?function} listener The callback to store.
   */
  putListener: function(id, registrationName, listener) {
    ("production" !== "development" ? invariant(
      !listener || typeof listener === 'function',
      'Expected %s listener to be a function, instead got type %s',
      registrationName, typeof listener
    ) : invariant(!listener || typeof listener === 'function'));

    if ("production" !== "development") {
      // IE8 has no API for event capturing and the `onScroll` event doesn't
      // bubble.
      if (registrationName === 'onScroll' &&
          !isEventSupported('scroll', true)) {
        monitorCodeUse('react_no_scroll_event');
        console.warn('This browser doesn\'t support the `onScroll` event');
      }
    }
    var bankForRegistrationName =
      listenerBank[registrationName] || (listenerBank[registrationName] = {});
    bankForRegistrationName[id] = listener;
  },

  /**
   * @param {string} id ID of the DOM element.
   * @param {string} registrationName Name of listener (e.g. `onClick`).
   * @return {?function} The stored callback.
   */
  getListener: function(id, registrationName) {
    var bankForRegistrationName = listenerBank[registrationName];
    return bankForRegistrationName && bankForRegistrationName[id];
  },

  /**
   * Deletes a listener from the registration bank.
   *
   * @param {string} id ID of the DOM element.
   * @param {string} registrationName Name of listener (e.g. `onClick`).
   */
  deleteListener: function(id, registrationName) {
    var bankForRegistrationName = listenerBank[registrationName];
    if (bankForRegistrationName) {
      delete bankForRegistrationName[id];
    }
  },

  /**
   * Deletes all listeners for the DOM element with the supplied ID.
   *
   * @param {string} id ID of the DOM element.
   */
  deleteAllListeners: function(id) {
    for (var registrationName in listenerBank) {
      delete listenerBank[registrationName][id];
    }
  },

  /**
   * Allows registered plugins an opportunity to extract events from top-level
   * native browser events.
   *
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @internal
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {
    var events;
    var plugins = EventPluginRegistry.plugins;
    for (var i = 0, l = plugins.length; i < l; i++) {
      // Not every plugin in the ordering may be loaded at runtime.
      var possiblePlugin = plugins[i];
      if (possiblePlugin) {
        var extractedEvents = possiblePlugin.extractEvents(
          topLevelType,
          topLevelTarget,
          topLevelTargetID,
          nativeEvent
        );
        if (extractedEvents) {
          events = accumulate(events, extractedEvents);
        }
      }
    }
    return events;
  },

  /**
   * Enqueues a synthetic event that should be dispatched when
   * `processEventQueue` is invoked.
   *
   * @param {*} events An accumulation of synthetic events.
   * @internal
   */
  enqueueEvents: function(events) {
    if (events) {
      eventQueue = accumulate(eventQueue, events);
    }
  },

  /**
   * Dispatches all synthetic events on the event queue.
   *
   * @internal
   */
  processEventQueue: function() {
    // Set `eventQueue` to null before processing it so that we can tell if more
    // events get enqueued while processing.
    var processingEventQueue = eventQueue;
    eventQueue = null;
    forEachAccumulated(processingEventQueue, executeDispatchesAndRelease);
    ("production" !== "development" ? invariant(
      !eventQueue,
      'processEventQueue(): Additional events were enqueued while processing ' +
      'an event queue. Support for this has not yet been implemented.'
    ) : invariant(!eventQueue));
  },

  /**
   * These are needed for tests only. Do not use!
   */
  __purge: function() {
    listenerBank = {};
  },

  __getListenerBank: function() {
    return listenerBank;
  }

};

module.exports = EventPluginHub;

},{"./EventPluginRegistry":18,"./EventPluginUtils":19,"./accumulate":94,"./forEachAccumulated":107,"./invariant":120,"./isEventSupported":121,"./monitorCodeUse":134}],18:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule EventPluginRegistry
 * @typechecks static-only
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * Injectable ordering of event plugins.
 */
var EventPluginOrder = null;

/**
 * Injectable mapping from names to event plugin modules.
 */
var namesToPlugins = {};

/**
 * Recomputes the plugin list using the injected plugins and plugin ordering.
 *
 * @private
 */
function recomputePluginOrdering() {
  if (!EventPluginOrder) {
    // Wait until an `EventPluginOrder` is injected.
    return;
  }
  for (var pluginName in namesToPlugins) {
    var PluginModule = namesToPlugins[pluginName];
    var pluginIndex = EventPluginOrder.indexOf(pluginName);
    ("production" !== "development" ? invariant(
      pluginIndex > -1,
      'EventPluginRegistry: Cannot inject event plugins that do not exist in ' +
      'the plugin ordering, `%s`.',
      pluginName
    ) : invariant(pluginIndex > -1));
    if (EventPluginRegistry.plugins[pluginIndex]) {
      continue;
    }
    ("production" !== "development" ? invariant(
      PluginModule.extractEvents,
      'EventPluginRegistry: Event plugins must implement an `extractEvents` ' +
      'method, but `%s` does not.',
      pluginName
    ) : invariant(PluginModule.extractEvents));
    EventPluginRegistry.plugins[pluginIndex] = PluginModule;
    var publishedEvents = PluginModule.eventTypes;
    for (var eventName in publishedEvents) {
      ("production" !== "development" ? invariant(
        publishEventForPlugin(
          publishedEvents[eventName],
          PluginModule,
          eventName
        ),
        'EventPluginRegistry: Failed to publish event `%s` for plugin `%s`.',
        eventName,
        pluginName
      ) : invariant(publishEventForPlugin(
        publishedEvents[eventName],
        PluginModule,
        eventName
      )));
    }
  }
}

/**
 * Publishes an event so that it can be dispatched by the supplied plugin.
 *
 * @param {object} dispatchConfig Dispatch configuration for the event.
 * @param {object} PluginModule Plugin publishing the event.
 * @return {boolean} True if the event was successfully published.
 * @private
 */
function publishEventForPlugin(dispatchConfig, PluginModule, eventName) {
  ("production" !== "development" ? invariant(
    !EventPluginRegistry.eventNameDispatchConfigs.hasOwnProperty(eventName),
    'EventPluginHub: More than one plugin attempted to publish the same ' +
    'event name, `%s`.',
    eventName
  ) : invariant(!EventPluginRegistry.eventNameDispatchConfigs.hasOwnProperty(eventName)));
  EventPluginRegistry.eventNameDispatchConfigs[eventName] = dispatchConfig;

  var phasedRegistrationNames = dispatchConfig.phasedRegistrationNames;
  if (phasedRegistrationNames) {
    for (var phaseName in phasedRegistrationNames) {
      if (phasedRegistrationNames.hasOwnProperty(phaseName)) {
        var phasedRegistrationName = phasedRegistrationNames[phaseName];
        publishRegistrationName(
          phasedRegistrationName,
          PluginModule,
          eventName
        );
      }
    }
    return true;
  } else if (dispatchConfig.registrationName) {
    publishRegistrationName(
      dispatchConfig.registrationName,
      PluginModule,
      eventName
    );
    return true;
  }
  return false;
}

/**
 * Publishes a registration name that is used to identify dispatched events and
 * can be used with `EventPluginHub.putListener` to register listeners.
 *
 * @param {string} registrationName Registration name to add.
 * @param {object} PluginModule Plugin publishing the event.
 * @private
 */
function publishRegistrationName(registrationName, PluginModule, eventName) {
  ("production" !== "development" ? invariant(
    !EventPluginRegistry.registrationNameModules[registrationName],
    'EventPluginHub: More than one plugin attempted to publish the same ' +
    'registration name, `%s`.',
    registrationName
  ) : invariant(!EventPluginRegistry.registrationNameModules[registrationName]));
  EventPluginRegistry.registrationNameModules[registrationName] = PluginModule;
  EventPluginRegistry.registrationNameDependencies[registrationName] =
    PluginModule.eventTypes[eventName].dependencies;
}

/**
 * Registers plugins so that they can extract and dispatch events.
 *
 * @see {EventPluginHub}
 */
var EventPluginRegistry = {

  /**
   * Ordered list of injected plugins.
   */
  plugins: [],

  /**
   * Mapping from event name to dispatch config
   */
  eventNameDispatchConfigs: {},

  /**
   * Mapping from registration name to plugin module
   */
  registrationNameModules: {},

  /**
   * Mapping from registration name to event name
   */
  registrationNameDependencies: {},

  /**
   * Injects an ordering of plugins (by plugin name). This allows the ordering
   * to be decoupled from injection of the actual plugins so that ordering is
   * always deterministic regardless of packaging, on-the-fly injection, etc.
   *
   * @param {array} InjectedEventPluginOrder
   * @internal
   * @see {EventPluginHub.injection.injectEventPluginOrder}
   */
  injectEventPluginOrder: function(InjectedEventPluginOrder) {
    ("production" !== "development" ? invariant(
      !EventPluginOrder,
      'EventPluginRegistry: Cannot inject event plugin ordering more than ' +
      'once. You are likely trying to load more than one copy of React.'
    ) : invariant(!EventPluginOrder));
    // Clone the ordering so it cannot be dynamically mutated.
    EventPluginOrder = Array.prototype.slice.call(InjectedEventPluginOrder);
    recomputePluginOrdering();
  },

  /**
   * Injects plugins to be used by `EventPluginHub`. The plugin names must be
   * in the ordering injected by `injectEventPluginOrder`.
   *
   * Plugins can be injected as part of page initialization or on-the-fly.
   *
   * @param {object} injectedNamesToPlugins Map from names to plugin modules.
   * @internal
   * @see {EventPluginHub.injection.injectEventPluginsByName}
   */
  injectEventPluginsByName: function(injectedNamesToPlugins) {
    var isOrderingDirty = false;
    for (var pluginName in injectedNamesToPlugins) {
      if (!injectedNamesToPlugins.hasOwnProperty(pluginName)) {
        continue;
      }
      var PluginModule = injectedNamesToPlugins[pluginName];
      if (!namesToPlugins.hasOwnProperty(pluginName) ||
          namesToPlugins[pluginName] !== PluginModule) {
        ("production" !== "development" ? invariant(
          !namesToPlugins[pluginName],
          'EventPluginRegistry: Cannot inject two different event plugins ' +
          'using the same name, `%s`.',
          pluginName
        ) : invariant(!namesToPlugins[pluginName]));
        namesToPlugins[pluginName] = PluginModule;
        isOrderingDirty = true;
      }
    }
    if (isOrderingDirty) {
      recomputePluginOrdering();
    }
  },

  /**
   * Looks up the plugin for the supplied event.
   *
   * @param {object} event A synthetic event.
   * @return {?object} The plugin that created the supplied event.
   * @internal
   */
  getPluginModuleForEvent: function(event) {
    var dispatchConfig = event.dispatchConfig;
    if (dispatchConfig.registrationName) {
      return EventPluginRegistry.registrationNameModules[
        dispatchConfig.registrationName
      ] || null;
    }
    for (var phase in dispatchConfig.phasedRegistrationNames) {
      if (!dispatchConfig.phasedRegistrationNames.hasOwnProperty(phase)) {
        continue;
      }
      var PluginModule = EventPluginRegistry.registrationNameModules[
        dispatchConfig.phasedRegistrationNames[phase]
      ];
      if (PluginModule) {
        return PluginModule;
      }
    }
    return null;
  },

  /**
   * Exposed for unit testing.
   * @private
   */
  _resetEventPlugins: function() {
    EventPluginOrder = null;
    for (var pluginName in namesToPlugins) {
      if (namesToPlugins.hasOwnProperty(pluginName)) {
        delete namesToPlugins[pluginName];
      }
    }
    EventPluginRegistry.plugins.length = 0;

    var eventNameDispatchConfigs = EventPluginRegistry.eventNameDispatchConfigs;
    for (var eventName in eventNameDispatchConfigs) {
      if (eventNameDispatchConfigs.hasOwnProperty(eventName)) {
        delete eventNameDispatchConfigs[eventName];
      }
    }

    var registrationNameModules = EventPluginRegistry.registrationNameModules;
    for (var registrationName in registrationNameModules) {
      if (registrationNameModules.hasOwnProperty(registrationName)) {
        delete registrationNameModules[registrationName];
      }
    }
  }

};

module.exports = EventPluginRegistry;

},{"./invariant":120}],19:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule EventPluginUtils
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");

var invariant = _dereq_("./invariant");

/**
 * Injected dependencies:
 */

/**
 * - `Mount`: [required] Module that can convert between React dom IDs and
 *   actual node references.
 */
var injection = {
  Mount: null,
  injectMount: function(InjectedMount) {
    injection.Mount = InjectedMount;
    if ("production" !== "development") {
      ("production" !== "development" ? invariant(
        InjectedMount && InjectedMount.getNode,
        'EventPluginUtils.injection.injectMount(...): Injected Mount module ' +
        'is missing getNode.'
      ) : invariant(InjectedMount && InjectedMount.getNode));
    }
  }
};

var topLevelTypes = EventConstants.topLevelTypes;

function isEndish(topLevelType) {
  return topLevelType === topLevelTypes.topMouseUp ||
         topLevelType === topLevelTypes.topTouchEnd ||
         topLevelType === topLevelTypes.topTouchCancel;
}

function isMoveish(topLevelType) {
  return topLevelType === topLevelTypes.topMouseMove ||
         topLevelType === topLevelTypes.topTouchMove;
}
function isStartish(topLevelType) {
  return topLevelType === topLevelTypes.topMouseDown ||
         topLevelType === topLevelTypes.topTouchStart;
}


var validateEventDispatches;
if ("production" !== "development") {
  validateEventDispatches = function(event) {
    var dispatchListeners = event._dispatchListeners;
    var dispatchIDs = event._dispatchIDs;

    var listenersIsArr = Array.isArray(dispatchListeners);
    var idsIsArr = Array.isArray(dispatchIDs);
    var IDsLen = idsIsArr ? dispatchIDs.length : dispatchIDs ? 1 : 0;
    var listenersLen = listenersIsArr ?
      dispatchListeners.length :
      dispatchListeners ? 1 : 0;

    ("production" !== "development" ? invariant(
      idsIsArr === listenersIsArr && IDsLen === listenersLen,
      'EventPluginUtils: Invalid `event`.'
    ) : invariant(idsIsArr === listenersIsArr && IDsLen === listenersLen));
  };
}

/**
 * Invokes `cb(event, listener, id)`. Avoids using call if no scope is
 * provided. The `(listener,id)` pair effectively forms the "dispatch" but are
 * kept separate to conserve memory.
 */
function forEachEventDispatch(event, cb) {
  var dispatchListeners = event._dispatchListeners;
  var dispatchIDs = event._dispatchIDs;
  if ("production" !== "development") {
    validateEventDispatches(event);
  }
  if (Array.isArray(dispatchListeners)) {
    for (var i = 0; i < dispatchListeners.length; i++) {
      if (event.isPropagationStopped()) {
        break;
      }
      // Listeners and IDs are two parallel arrays that are always in sync.
      cb(event, dispatchListeners[i], dispatchIDs[i]);
    }
  } else if (dispatchListeners) {
    cb(event, dispatchListeners, dispatchIDs);
  }
}

/**
 * Default implementation of PluginModule.executeDispatch().
 * @param {SyntheticEvent} SyntheticEvent to handle
 * @param {function} Application-level callback
 * @param {string} domID DOM id to pass to the callback.
 */
function executeDispatch(event, listener, domID) {
  event.currentTarget = injection.Mount.getNode(domID);
  var returnValue = listener(event, domID);
  event.currentTarget = null;
  return returnValue;
}

/**
 * Standard/simple iteration through an event's collected dispatches.
 */
function executeDispatchesInOrder(event, executeDispatch) {
  forEachEventDispatch(event, executeDispatch);
  event._dispatchListeners = null;
  event._dispatchIDs = null;
}

/**
 * Standard/simple iteration through an event's collected dispatches, but stops
 * at the first dispatch execution returning true, and returns that id.
 *
 * @return id of the first dispatch execution who's listener returns true, or
 * null if no listener returned true.
 */
function executeDispatchesInOrderStopAtTrueImpl(event) {
  var dispatchListeners = event._dispatchListeners;
  var dispatchIDs = event._dispatchIDs;
  if ("production" !== "development") {
    validateEventDispatches(event);
  }
  if (Array.isArray(dispatchListeners)) {
    for (var i = 0; i < dispatchListeners.length; i++) {
      if (event.isPropagationStopped()) {
        break;
      }
      // Listeners and IDs are two parallel arrays that are always in sync.
      if (dispatchListeners[i](event, dispatchIDs[i])) {
        return dispatchIDs[i];
      }
    }
  } else if (dispatchListeners) {
    if (dispatchListeners(event, dispatchIDs)) {
      return dispatchIDs;
    }
  }
  return null;
}

/**
 * @see executeDispatchesInOrderStopAtTrueImpl
 */
function executeDispatchesInOrderStopAtTrue(event) {
  var ret = executeDispatchesInOrderStopAtTrueImpl(event);
  event._dispatchIDs = null;
  event._dispatchListeners = null;
  return ret;
}

/**
 * Execution of a "direct" dispatch - there must be at most one dispatch
 * accumulated on the event or it is considered an error. It doesn't really make
 * sense for an event with multiple dispatches (bubbled) to keep track of the
 * return values at each dispatch execution, but it does tend to make sense when
 * dealing with "direct" dispatches.
 *
 * @return The return value of executing the single dispatch.
 */
function executeDirectDispatch(event) {
  if ("production" !== "development") {
    validateEventDispatches(event);
  }
  var dispatchListener = event._dispatchListeners;
  var dispatchID = event._dispatchIDs;
  ("production" !== "development" ? invariant(
    !Array.isArray(dispatchListener),
    'executeDirectDispatch(...): Invalid `event`.'
  ) : invariant(!Array.isArray(dispatchListener)));
  var res = dispatchListener ?
    dispatchListener(event, dispatchID) :
    null;
  event._dispatchListeners = null;
  event._dispatchIDs = null;
  return res;
}

/**
 * @param {SyntheticEvent} event
 * @return {bool} True iff number of dispatches accumulated is greater than 0.
 */
function hasDispatches(event) {
  return !!event._dispatchListeners;
}

/**
 * General utilities that are useful in creating custom Event Plugins.
 */
var EventPluginUtils = {
  isEndish: isEndish,
  isMoveish: isMoveish,
  isStartish: isStartish,

  executeDirectDispatch: executeDirectDispatch,
  executeDispatch: executeDispatch,
  executeDispatchesInOrder: executeDispatchesInOrder,
  executeDispatchesInOrderStopAtTrue: executeDispatchesInOrderStopAtTrue,
  hasDispatches: hasDispatches,
  injection: injection,
  useTouchEvents: false
};

module.exports = EventPluginUtils;

},{"./EventConstants":15,"./invariant":120}],20:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule EventPropagators
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPluginHub = _dereq_("./EventPluginHub");

var accumulate = _dereq_("./accumulate");
var forEachAccumulated = _dereq_("./forEachAccumulated");

var PropagationPhases = EventConstants.PropagationPhases;
var getListener = EventPluginHub.getListener;

/**
 * Some event types have a notion of different registration names for different
 * "phases" of propagation. This finds listeners by a given phase.
 */
function listenerAtPhase(id, event, propagationPhase) {
  var registrationName =
    event.dispatchConfig.phasedRegistrationNames[propagationPhase];
  return getListener(id, registrationName);
}

/**
 * Tags a `SyntheticEvent` with dispatched listeners. Creating this function
 * here, allows us to not have to bind or create functions for each event.
 * Mutating the event's members allows us to not have to create a wrapping
 * "dispatch" object that pairs the event with the listener.
 */
function accumulateDirectionalDispatches(domID, upwards, event) {
  if ("production" !== "development") {
    if (!domID) {
      throw new Error('Dispatching id must not be null');
    }
  }
  var phase = upwards ? PropagationPhases.bubbled : PropagationPhases.captured;
  var listener = listenerAtPhase(domID, event, phase);
  if (listener) {
    event._dispatchListeners = accumulate(event._dispatchListeners, listener);
    event._dispatchIDs = accumulate(event._dispatchIDs, domID);
  }
}

/**
 * Collect dispatches (must be entirely collected before dispatching - see unit
 * tests). Lazily allocate the array to conserve memory.  We must loop through
 * each event and perform the traversal for each one. We can not perform a
 * single traversal for the entire collection of events because each event may
 * have a different target.
 */
function accumulateTwoPhaseDispatchesSingle(event) {
  if (event && event.dispatchConfig.phasedRegistrationNames) {
    EventPluginHub.injection.getInstanceHandle().traverseTwoPhase(
      event.dispatchMarker,
      accumulateDirectionalDispatches,
      event
    );
  }
}


/**
 * Accumulates without regard to direction, does not look for phased
 * registration names. Same as `accumulateDirectDispatchesSingle` but without
 * requiring that the `dispatchMarker` be the same as the dispatched ID.
 */
function accumulateDispatches(id, ignoredDirection, event) {
  if (event && event.dispatchConfig.registrationName) {
    var registrationName = event.dispatchConfig.registrationName;
    var listener = getListener(id, registrationName);
    if (listener) {
      event._dispatchListeners = accumulate(event._dispatchListeners, listener);
      event._dispatchIDs = accumulate(event._dispatchIDs, id);
    }
  }
}

/**
 * Accumulates dispatches on an `SyntheticEvent`, but only for the
 * `dispatchMarker`.
 * @param {SyntheticEvent} event
 */
function accumulateDirectDispatchesSingle(event) {
  if (event && event.dispatchConfig.registrationName) {
    accumulateDispatches(event.dispatchMarker, null, event);
  }
}

function accumulateTwoPhaseDispatches(events) {
  forEachAccumulated(events, accumulateTwoPhaseDispatchesSingle);
}

function accumulateEnterLeaveDispatches(leave, enter, fromID, toID) {
  EventPluginHub.injection.getInstanceHandle().traverseEnterLeave(
    fromID,
    toID,
    accumulateDispatches,
    leave,
    enter
  );
}


function accumulateDirectDispatches(events) {
  forEachAccumulated(events, accumulateDirectDispatchesSingle);
}



/**
 * A small set of propagation patterns, each of which will accept a small amount
 * of information, and generate a set of "dispatch ready event objects" - which
 * are sets of events that have already been annotated with a set of dispatched
 * listener functions/ids. The API is designed this way to discourage these
 * propagation strategies from actually executing the dispatches, since we
 * always want to collect the entire set of dispatches before executing event a
 * single one.
 *
 * @constructor EventPropagators
 */
var EventPropagators = {
  accumulateTwoPhaseDispatches: accumulateTwoPhaseDispatches,
  accumulateDirectDispatches: accumulateDirectDispatches,
  accumulateEnterLeaveDispatches: accumulateEnterLeaveDispatches
};

module.exports = EventPropagators;

},{"./EventConstants":15,"./EventPluginHub":17,"./accumulate":94,"./forEachAccumulated":107}],21:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ExecutionEnvironment
 */

/*jslint evil: true */

"use strict";

var canUseDOM = !!(
  typeof window !== 'undefined' &&
  window.document &&
  window.document.createElement
);

/**
 * Simple, lightweight module assisting with the detection and context of
 * Worker. Helps avoid circular dependencies and allows code to reason about
 * whether or not they are in a Worker, even if they never include the main
 * `ReactWorker` dependency.
 */
var ExecutionEnvironment = {

  canUseDOM: canUseDOM,

  canUseWorkers: typeof Worker !== 'undefined',

  canUseEventListeners:
    canUseDOM && !!(window.addEventListener || window.attachEvent),

  canUseViewport: canUseDOM && !!window.screen,

  isInWorker: !canUseDOM // For now, this is true - might change in the future.

};

module.exports = ExecutionEnvironment;

},{}],22:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule HTMLDOMPropertyConfig
 */

/*jslint bitwise: true*/

"use strict";

var DOMProperty = _dereq_("./DOMProperty");
var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var MUST_USE_ATTRIBUTE = DOMProperty.injection.MUST_USE_ATTRIBUTE;
var MUST_USE_PROPERTY = DOMProperty.injection.MUST_USE_PROPERTY;
var HAS_BOOLEAN_VALUE = DOMProperty.injection.HAS_BOOLEAN_VALUE;
var HAS_SIDE_EFFECTS = DOMProperty.injection.HAS_SIDE_EFFECTS;
var HAS_NUMERIC_VALUE = DOMProperty.injection.HAS_NUMERIC_VALUE;
var HAS_POSITIVE_NUMERIC_VALUE =
  DOMProperty.injection.HAS_POSITIVE_NUMERIC_VALUE;
var HAS_OVERLOADED_BOOLEAN_VALUE =
  DOMProperty.injection.HAS_OVERLOADED_BOOLEAN_VALUE;

var hasSVG;
if (ExecutionEnvironment.canUseDOM) {
  var implementation = document.implementation;
  hasSVG = (
    implementation &&
    implementation.hasFeature &&
    implementation.hasFeature(
      'http://www.w3.org/TR/SVG11/feature#BasicStructure',
      '1.1'
    )
  );
}


var HTMLDOMPropertyConfig = {
  isCustomAttribute: RegExp.prototype.test.bind(
    /^(data|aria)-[a-z_][a-z\d_.\-]*$/
  ),
  Properties: {
    /**
     * Standard Properties
     */
    accept: null,
    accessKey: null,
    action: null,
    allowFullScreen: MUST_USE_ATTRIBUTE | HAS_BOOLEAN_VALUE,
    allowTransparency: MUST_USE_ATTRIBUTE,
    alt: null,
    async: HAS_BOOLEAN_VALUE,
    autoComplete: null,
    // autoFocus is polyfilled/normalized by AutoFocusMixin
    // autoFocus: HAS_BOOLEAN_VALUE,
    autoPlay: HAS_BOOLEAN_VALUE,
    cellPadding: null,
    cellSpacing: null,
    charSet: MUST_USE_ATTRIBUTE,
    checked: MUST_USE_PROPERTY | HAS_BOOLEAN_VALUE,
    // To set className on SVG elements, it's necessary to use .setAttribute;
    // this works on HTML elements too in all browsers except IE8. Conveniently,
    // IE8 doesn't support SVG and so we can simply use the attribute in
    // browsers that support SVG and the property in browsers that don't,
    // regardless of whether the element is HTML or SVG.
    className: hasSVG ? MUST_USE_ATTRIBUTE : MUST_USE_PROPERTY,
    cols: MUST_USE_ATTRIBUTE | HAS_POSITIVE_NUMERIC_VALUE,
    colSpan: null,
    content: null,
    contentEditable: null,
    contextMenu: MUST_USE_ATTRIBUTE,
    controls: MUST_USE_PROPERTY | HAS_BOOLEAN_VALUE,
    coords: null,
    crossOrigin: null,
    data: null, // For `<object />` acts as `src`.
    dateTime: MUST_USE_ATTRIBUTE,
    defer: HAS_BOOLEAN_VALUE,
    dir: null,
    disabled: MUST_USE_ATTRIBUTE | HAS_BOOLEAN_VALUE,
    download: HAS_OVERLOADED_BOOLEAN_VALUE,
    draggable: null,
    encType: null,
    form: MUST_USE_ATTRIBUTE,
    formNoValidate: HAS_BOOLEAN_VALUE,
    frameBorder: MUST_USE_ATTRIBUTE,
    height: MUST_USE_ATTRIBUTE,
    hidden: MUST_USE_ATTRIBUTE | HAS_BOOLEAN_VALUE,
    href: null,
    hrefLang: null,
    htmlFor: null,
    httpEquiv: null,
    icon: null,
    id: MUST_USE_PROPERTY,
    label: null,
    lang: null,
    list: null,
    loop: MUST_USE_PROPERTY | HAS_BOOLEAN_VALUE,
    max: null,
    maxLength: MUST_USE_ATTRIBUTE,
    media: MUST_USE_ATTRIBUTE,
    mediaGroup: null,
    method: null,
    min: null,
    multiple: MUST_USE_PROPERTY | HAS_BOOLEAN_VALUE,
    muted: MUST_USE_PROPERTY | HAS_BOOLEAN_VALUE,
    name: null,
    noValidate: HAS_BOOLEAN_VALUE,
    open: null,
    pattern: null,
    placeholder: null,
    poster: null,
    preload: null,
    radioGroup: null,
    readOnly: MUST_USE_PROPERTY | HAS_BOOLEAN_VALUE,
    rel: null,
    required: HAS_BOOLEAN_VALUE,
    role: MUST_USE_ATTRIBUTE,
    rows: MUST_USE_ATTRIBUTE | HAS_POSITIVE_NUMERIC_VALUE,
    rowSpan: null,
    sandbox: null,
    scope: null,
    scrollLeft: MUST_USE_PROPERTY,
    scrolling: null,
    scrollTop: MUST_USE_PROPERTY,
    seamless: MUST_USE_ATTRIBUTE | HAS_BOOLEAN_VALUE,
    selected: MUST_USE_PROPERTY | HAS_BOOLEAN_VALUE,
    shape: null,
    size: MUST_USE_ATTRIBUTE | HAS_POSITIVE_NUMERIC_VALUE,
    sizes: MUST_USE_ATTRIBUTE,
    span: HAS_POSITIVE_NUMERIC_VALUE,
    spellCheck: null,
    src: null,
    srcDoc: MUST_USE_PROPERTY,
    srcSet: MUST_USE_ATTRIBUTE,
    start: HAS_NUMERIC_VALUE,
    step: null,
    style: null,
    tabIndex: null,
    target: null,
    title: null,
    type: null,
    useMap: null,
    value: MUST_USE_PROPERTY | HAS_SIDE_EFFECTS,
    width: MUST_USE_ATTRIBUTE,
    wmode: MUST_USE_ATTRIBUTE,

    /**
     * Non-standard Properties
     */
    autoCapitalize: null, // Supported in Mobile Safari for keyboard hints
    autoCorrect: null, // Supported in Mobile Safari for keyboard hints
    itemProp: MUST_USE_ATTRIBUTE, // Microdata: http://schema.org/docs/gs.html
    itemScope: MUST_USE_ATTRIBUTE | HAS_BOOLEAN_VALUE, // Microdata: http://schema.org/docs/gs.html
    itemType: MUST_USE_ATTRIBUTE, // Microdata: http://schema.org/docs/gs.html
    property: null // Supports OG in meta tags
  },
  DOMAttributeNames: {
    className: 'class',
    htmlFor: 'for',
    httpEquiv: 'http-equiv'
  },
  DOMPropertyNames: {
    autoCapitalize: 'autocapitalize',
    autoComplete: 'autocomplete',
    autoCorrect: 'autocorrect',
    autoFocus: 'autofocus',
    autoPlay: 'autoplay',
    encType: 'enctype',
    hrefLang: 'hreflang',
    radioGroup: 'radiogroup',
    spellCheck: 'spellcheck',
    srcDoc: 'srcdoc',
    srcSet: 'srcset'
  }
};

module.exports = HTMLDOMPropertyConfig;

},{"./DOMProperty":10,"./ExecutionEnvironment":21}],23:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule LinkedValueUtils
 * @typechecks static-only
 */

"use strict";

var ReactPropTypes = _dereq_("./ReactPropTypes");

var invariant = _dereq_("./invariant");

var hasReadOnlyValue = {
  'button': true,
  'checkbox': true,
  'image': true,
  'hidden': true,
  'radio': true,
  'reset': true,
  'submit': true
};

function _assertSingleLink(input) {
  ("production" !== "development" ? invariant(
    input.props.checkedLink == null || input.props.valueLink == null,
    'Cannot provide a checkedLink and a valueLink. If you want to use ' +
    'checkedLink, you probably don\'t want to use valueLink and vice versa.'
  ) : invariant(input.props.checkedLink == null || input.props.valueLink == null));
}
function _assertValueLink(input) {
  _assertSingleLink(input);
  ("production" !== "development" ? invariant(
    input.props.value == null && input.props.onChange == null,
    'Cannot provide a valueLink and a value or onChange event. If you want ' +
    'to use value or onChange, you probably don\'t want to use valueLink.'
  ) : invariant(input.props.value == null && input.props.onChange == null));
}

function _assertCheckedLink(input) {
  _assertSingleLink(input);
  ("production" !== "development" ? invariant(
    input.props.checked == null && input.props.onChange == null,
    'Cannot provide a checkedLink and a checked property or onChange event. ' +
    'If you want to use checked or onChange, you probably don\'t want to ' +
    'use checkedLink'
  ) : invariant(input.props.checked == null && input.props.onChange == null));
}

/**
 * @param {SyntheticEvent} e change event to handle
 */
function _handleLinkedValueChange(e) {
  /*jshint validthis:true */
  this.props.valueLink.requestChange(e.target.value);
}

/**
  * @param {SyntheticEvent} e change event to handle
  */
function _handleLinkedCheckChange(e) {
  /*jshint validthis:true */
  this.props.checkedLink.requestChange(e.target.checked);
}

/**
 * Provide a linked `value` attribute for controlled forms. You should not use
 * this outside of the ReactDOM controlled form components.
 */
var LinkedValueUtils = {
  Mixin: {
    propTypes: {
      value: function(props, propName, componentName) {
        if (!props[propName] ||
            hasReadOnlyValue[props.type] ||
            props.onChange ||
            props.readOnly ||
            props.disabled) {
          return;
        }
        return new Error(
          'You provided a `value` prop to a form field without an ' +
          '`onChange` handler. This will render a read-only field. If ' +
          'the field should be mutable use `defaultValue`. Otherwise, ' +
          'set either `onChange` or `readOnly`.'
        );
      },
      checked: function(props, propName, componentName) {
        if (!props[propName] ||
            props.onChange ||
            props.readOnly ||
            props.disabled) {
          return;
        }
        return new Error(
          'You provided a `checked` prop to a form field without an ' +
          '`onChange` handler. This will render a read-only field. If ' +
          'the field should be mutable use `defaultChecked`. Otherwise, ' +
          'set either `onChange` or `readOnly`.'
        );
      },
      onChange: ReactPropTypes.func
    }
  },

  /**
   * @param {ReactComponent} input Form component
   * @return {*} current value of the input either from value prop or link.
   */
  getValue: function(input) {
    if (input.props.valueLink) {
      _assertValueLink(input);
      return input.props.valueLink.value;
    }
    return input.props.value;
  },

  /**
   * @param {ReactComponent} input Form component
   * @return {*} current checked status of the input either from checked prop
   *             or link.
   */
  getChecked: function(input) {
    if (input.props.checkedLink) {
      _assertCheckedLink(input);
      return input.props.checkedLink.value;
    }
    return input.props.checked;
  },

  /**
   * @param {ReactComponent} input Form component
   * @return {function} change callback either from onChange prop or link.
   */
  getOnChange: function(input) {
    if (input.props.valueLink) {
      _assertValueLink(input);
      return _handleLinkedValueChange;
    } else if (input.props.checkedLink) {
      _assertCheckedLink(input);
      return _handleLinkedCheckChange;
    }
    return input.props.onChange;
  }
};

module.exports = LinkedValueUtils;

},{"./ReactPropTypes":69,"./invariant":120}],24:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule LocalEventTrapMixin
 */

"use strict";

var ReactBrowserEventEmitter = _dereq_("./ReactBrowserEventEmitter");

var accumulate = _dereq_("./accumulate");
var forEachAccumulated = _dereq_("./forEachAccumulated");
var invariant = _dereq_("./invariant");

function remove(event) {
  event.remove();
}

var LocalEventTrapMixin = {
  trapBubbledEvent:function(topLevelType, handlerBaseName) {
    ("production" !== "development" ? invariant(this.isMounted(), 'Must be mounted to trap events') : invariant(this.isMounted()));
    var listener = ReactBrowserEventEmitter.trapBubbledEvent(
      topLevelType,
      handlerBaseName,
      this.getDOMNode()
    );
    this._localEventListeners = accumulate(this._localEventListeners, listener);
  },

  // trapCapturedEvent would look nearly identical. We don't implement that
  // method because it isn't currently needed.

  componentWillUnmount:function() {
    if (this._localEventListeners) {
      forEachAccumulated(this._localEventListeners, remove);
    }
  }
};

module.exports = LocalEventTrapMixin;

},{"./ReactBrowserEventEmitter":29,"./accumulate":94,"./forEachAccumulated":107,"./invariant":120}],25:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule MobileSafariClickEventPlugin
 * @typechecks static-only
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");

var emptyFunction = _dereq_("./emptyFunction");

var topLevelTypes = EventConstants.topLevelTypes;

/**
 * Mobile Safari does not fire properly bubble click events on non-interactive
 * elements, which means delegated click listeners do not fire. The workaround
 * for this bug involves attaching an empty click listener on the target node.
 *
 * This particular plugin works around the bug by attaching an empty click
 * listener on `touchstart` (which does fire on every element).
 */
var MobileSafariClickEventPlugin = {

  eventTypes: null,

  /**
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {
    if (topLevelType === topLevelTypes.topTouchStart) {
      var target = nativeEvent.target;
      if (target && !target.onclick) {
        target.onclick = emptyFunction;
      }
    }
  }

};

module.exports = MobileSafariClickEventPlugin;

},{"./EventConstants":15,"./emptyFunction":102}],26:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule PooledClass
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * Static poolers. Several custom versions for each potential number of
 * arguments. A completely generic pooler is easy to implement, but would
 * require accessing the `arguments` object. In each of these, `this` refers to
 * the Class itself, not an instance. If any others are needed, simply add them
 * here, or in their own files.
 */
var oneArgumentPooler = function(copyFieldsFrom) {
  var Klass = this;
  if (Klass.instancePool.length) {
    var instance = Klass.instancePool.pop();
    Klass.call(instance, copyFieldsFrom);
    return instance;
  } else {
    return new Klass(copyFieldsFrom);
  }
};

var twoArgumentPooler = function(a1, a2) {
  var Klass = this;
  if (Klass.instancePool.length) {
    var instance = Klass.instancePool.pop();
    Klass.call(instance, a1, a2);
    return instance;
  } else {
    return new Klass(a1, a2);
  }
};

var threeArgumentPooler = function(a1, a2, a3) {
  var Klass = this;
  if (Klass.instancePool.length) {
    var instance = Klass.instancePool.pop();
    Klass.call(instance, a1, a2, a3);
    return instance;
  } else {
    return new Klass(a1, a2, a3);
  }
};

var fiveArgumentPooler = function(a1, a2, a3, a4, a5) {
  var Klass = this;
  if (Klass.instancePool.length) {
    var instance = Klass.instancePool.pop();
    Klass.call(instance, a1, a2, a3, a4, a5);
    return instance;
  } else {
    return new Klass(a1, a2, a3, a4, a5);
  }
};

var standardReleaser = function(instance) {
  var Klass = this;
  ("production" !== "development" ? invariant(
    instance instanceof Klass,
    'Trying to release an instance into a pool of a different type.'
  ) : invariant(instance instanceof Klass));
  if (instance.destructor) {
    instance.destructor();
  }
  if (Klass.instancePool.length < Klass.poolSize) {
    Klass.instancePool.push(instance);
  }
};

var DEFAULT_POOL_SIZE = 10;
var DEFAULT_POOLER = oneArgumentPooler;

/**
 * Augments `CopyConstructor` to be a poolable class, augmenting only the class
 * itself (statically) not adding any prototypical fields. Any CopyConstructor
 * you give this may have a `poolSize` property, and will look for a
 * prototypical `destructor` on instances (optional).
 *
 * @param {Function} CopyConstructor Constructor that can be used to reset.
 * @param {Function} pooler Customizable pooler.
 */
var addPoolingTo = function(CopyConstructor, pooler) {
  var NewKlass = CopyConstructor;
  NewKlass.instancePool = [];
  NewKlass.getPooled = pooler || DEFAULT_POOLER;
  if (!NewKlass.poolSize) {
    NewKlass.poolSize = DEFAULT_POOL_SIZE;
  }
  NewKlass.release = standardReleaser;
  return NewKlass;
};

var PooledClass = {
  addPoolingTo: addPoolingTo,
  oneArgumentPooler: oneArgumentPooler,
  twoArgumentPooler: twoArgumentPooler,
  threeArgumentPooler: threeArgumentPooler,
  fiveArgumentPooler: fiveArgumentPooler
};

module.exports = PooledClass;

},{"./invariant":120}],27:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule React
 */

"use strict";

var DOMPropertyOperations = _dereq_("./DOMPropertyOperations");
var EventPluginUtils = _dereq_("./EventPluginUtils");
var ReactChildren = _dereq_("./ReactChildren");
var ReactComponent = _dereq_("./ReactComponent");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactContext = _dereq_("./ReactContext");
var ReactCurrentOwner = _dereq_("./ReactCurrentOwner");
var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactDOM = _dereq_("./ReactDOM");
var ReactDOMComponent = _dereq_("./ReactDOMComponent");
var ReactDefaultInjection = _dereq_("./ReactDefaultInjection");
var ReactInstanceHandles = _dereq_("./ReactInstanceHandles");
var ReactMount = _dereq_("./ReactMount");
var ReactMultiChild = _dereq_("./ReactMultiChild");
var ReactPerf = _dereq_("./ReactPerf");
var ReactPropTypes = _dereq_("./ReactPropTypes");
var ReactServerRendering = _dereq_("./ReactServerRendering");
var ReactTextComponent = _dereq_("./ReactTextComponent");

var onlyChild = _dereq_("./onlyChild");
var warning = _dereq_("./warning");

ReactDefaultInjection.inject();

// Specifying arguments isn't necessary since we just use apply anyway, but it
// makes it clear for those actually consuming this API.
function createDescriptor(type, props, children) {
  var args = Array.prototype.slice.call(arguments, 1);
  return type.apply(null, args);
}

if ("production" !== "development") {
  var _warnedForDeprecation = false;
}

var React = {
  Children: {
    map: ReactChildren.map,
    forEach: ReactChildren.forEach,
    count: ReactChildren.count,
    only: onlyChild
  },
  DOM: ReactDOM,
  PropTypes: ReactPropTypes,
  initializeTouchEvents: function(shouldUseTouch) {
    EventPluginUtils.useTouchEvents = shouldUseTouch;
  },
  createClass: ReactCompositeComponent.createClass,
  createDescriptor: function() {
    if ("production" !== "development") {
      ("production" !== "development" ? warning(
        _warnedForDeprecation,
        'React.createDescriptor is deprecated and will be removed in the ' +
        'next version of React. Use React.createElement instead.'
      ) : null);
      _warnedForDeprecation = true;
    }
    return createDescriptor.apply(this, arguments);
  },
  createElement: createDescriptor,
  constructAndRenderComponent: ReactMount.constructAndRenderComponent,
  constructAndRenderComponentByID: ReactMount.constructAndRenderComponentByID,
  renderComponent: ReactPerf.measure(
    'React',
    'renderComponent',
    ReactMount.renderComponent
  ),
  renderComponentToString: ReactServerRendering.renderComponentToString,
  renderComponentToStaticMarkup:
    ReactServerRendering.renderComponentToStaticMarkup,
  unmountComponentAtNode: ReactMount.unmountComponentAtNode,
  isValidClass: ReactDescriptor.isValidFactory,
  isValidComponent: ReactDescriptor.isValidDescriptor,
  withContext: ReactContext.withContext,
  __internals: {
    Component: ReactComponent,
    CurrentOwner: ReactCurrentOwner,
    DOMComponent: ReactDOMComponent,
    DOMPropertyOperations: DOMPropertyOperations,
    InstanceHandles: ReactInstanceHandles,
    Mount: ReactMount,
    MultiChild: ReactMultiChild,
    TextComponent: ReactTextComponent
  }
};

if ("production" !== "development") {
  var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");
  if (ExecutionEnvironment.canUseDOM &&
      window.top === window.self &&
      navigator.userAgent.indexOf('Chrome') > -1) {
    console.debug(
      'Download the React DevTools for a better development experience: ' +
      'http://fb.me/react-devtools'
    );

    var expectedFeatures = [
      // shims
      Array.isArray,
      Array.prototype.every,
      Array.prototype.forEach,
      Array.prototype.indexOf,
      Array.prototype.map,
      Date.now,
      Function.prototype.bind,
      Object.keys,
      String.prototype.split,
      String.prototype.trim,

      // shams
      Object.create,
      Object.freeze
    ];

    for (var i in expectedFeatures) {
      if (!expectedFeatures[i]) {
        console.error(
          'One or more ES5 shim/shams expected by React are not available: ' +
          'http://fb.me/react-warning-polyfills'
        );
        break;
      }
    }
  }
}

// Version exists only in the open-source version of React, not in Facebook's
// internal version.
React.version = '0.11.2';

module.exports = React;

},{"./DOMPropertyOperations":11,"./EventPluginUtils":19,"./ExecutionEnvironment":21,"./ReactChildren":30,"./ReactComponent":31,"./ReactCompositeComponent":33,"./ReactContext":34,"./ReactCurrentOwner":35,"./ReactDOM":36,"./ReactDOMComponent":38,"./ReactDefaultInjection":48,"./ReactDescriptor":51,"./ReactInstanceHandles":59,"./ReactMount":61,"./ReactMultiChild":62,"./ReactPerf":65,"./ReactPropTypes":69,"./ReactServerRendering":73,"./ReactTextComponent":75,"./onlyChild":135,"./warning":143}],28:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactBrowserComponentMixin
 */

"use strict";

var ReactEmptyComponent = _dereq_("./ReactEmptyComponent");
var ReactMount = _dereq_("./ReactMount");

var invariant = _dereq_("./invariant");

var ReactBrowserComponentMixin = {
  /**
   * Returns the DOM node rendered by this component.
   *
   * @return {DOMElement} The root node of this component.
   * @final
   * @protected
   */
  getDOMNode: function() {
    ("production" !== "development" ? invariant(
      this.isMounted(),
      'getDOMNode(): A component must be mounted to have a DOM node.'
    ) : invariant(this.isMounted()));
    if (ReactEmptyComponent.isNullComponentID(this._rootNodeID)) {
      return null;
    }
    return ReactMount.getNode(this._rootNodeID);
  }
};

module.exports = ReactBrowserComponentMixin;

},{"./ReactEmptyComponent":53,"./ReactMount":61,"./invariant":120}],29:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactBrowserEventEmitter
 * @typechecks static-only
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPluginHub = _dereq_("./EventPluginHub");
var EventPluginRegistry = _dereq_("./EventPluginRegistry");
var ReactEventEmitterMixin = _dereq_("./ReactEventEmitterMixin");
var ViewportMetrics = _dereq_("./ViewportMetrics");

var isEventSupported = _dereq_("./isEventSupported");
var merge = _dereq_("./merge");

/**
 * Summary of `ReactBrowserEventEmitter` event handling:
 *
 *  - Top-level delegation is used to trap most native browser events. This
 *    may only occur in the main thread and is the responsibility of
 *    ReactEventListener, which is injected and can therefore support pluggable
 *    event sources. This is the only work that occurs in the main thread.
 *
 *  - We normalize and de-duplicate events to account for browser quirks. This
 *    may be done in the worker thread.
 *
 *  - Forward these native events (with the associated top-level type used to
 *    trap it) to `EventPluginHub`, which in turn will ask plugins if they want
 *    to extract any synthetic events.
 *
 *  - The `EventPluginHub` will then process each event by annotating them with
 *    "dispatches", a sequence of listeners and IDs that care about that event.
 *
 *  - The `EventPluginHub` then dispatches the events.
 *
 * Overview of React and the event system:
 *
 * +------------+    .
 * |    DOM     |    .
 * +------------+    .
 *       |           .
 *       v           .
 * +------------+    .
 * | ReactEvent |    .
 * |  Listener  |    .
 * +------------+    .                         +-----------+
 *       |           .               +--------+|SimpleEvent|
 *       |           .               |         |Plugin     |
 * +-----|------+    .               v         +-----------+
 * |     |      |    .    +--------------+                    +------------+
 * |     +-----------.--->|EventPluginHub|                    |    Event   |
 * |            |    .    |              |     +-----------+  | Propagators|
 * | ReactEvent |    .    |              |     |TapEvent   |  |------------|
 * |  Emitter   |    .    |              |<---+|Plugin     |  |other plugin|
 * |            |    .    |              |     +-----------+  |  utilities |
 * |     +-----------.--->|              |                    +------------+
 * |     |      |    .    +--------------+
 * +-----|------+    .                ^        +-----------+
 *       |           .                |        |Enter/Leave|
 *       +           .                +-------+|Plugin     |
 * +-------------+   .                         +-----------+
 * | application |   .
 * |-------------|   .
 * |             |   .
 * |             |   .
 * +-------------+   .
 *                   .
 *    React Core     .  General Purpose Event Plugin System
 */

var alreadyListeningTo = {};
var isMonitoringScrollValue = false;
var reactTopListenersCounter = 0;

// For events like 'submit' which don't consistently bubble (which we trap at a
// lower node than `document`), binding at `document` would cause duplicate
// events so we don't include them here
var topEventMapping = {
  topBlur: 'blur',
  topChange: 'change',
  topClick: 'click',
  topCompositionEnd: 'compositionend',
  topCompositionStart: 'compositionstart',
  topCompositionUpdate: 'compositionupdate',
  topContextMenu: 'contextmenu',
  topCopy: 'copy',
  topCut: 'cut',
  topDoubleClick: 'dblclick',
  topDrag: 'drag',
  topDragEnd: 'dragend',
  topDragEnter: 'dragenter',
  topDragExit: 'dragexit',
  topDragLeave: 'dragleave',
  topDragOver: 'dragover',
  topDragStart: 'dragstart',
  topDrop: 'drop',
  topFocus: 'focus',
  topInput: 'input',
  topKeyDown: 'keydown',
  topKeyPress: 'keypress',
  topKeyUp: 'keyup',
  topMouseDown: 'mousedown',
  topMouseMove: 'mousemove',
  topMouseOut: 'mouseout',
  topMouseOver: 'mouseover',
  topMouseUp: 'mouseup',
  topPaste: 'paste',
  topScroll: 'scroll',
  topSelectionChange: 'selectionchange',
  topTextInput: 'textInput',
  topTouchCancel: 'touchcancel',
  topTouchEnd: 'touchend',
  topTouchMove: 'touchmove',
  topTouchStart: 'touchstart',
  topWheel: 'wheel'
};

/**
 * To ensure no conflicts with other potential React instances on the page
 */
var topListenersIDKey = "_reactListenersID" + String(Math.random()).slice(2);

function getListeningForDocument(mountAt) {
  // In IE8, `mountAt` is a host object and doesn't have `hasOwnProperty`
  // directly.
  if (!Object.prototype.hasOwnProperty.call(mountAt, topListenersIDKey)) {
    mountAt[topListenersIDKey] = reactTopListenersCounter++;
    alreadyListeningTo[mountAt[topListenersIDKey]] = {};
  }
  return alreadyListeningTo[mountAt[topListenersIDKey]];
}

/**
 * `ReactBrowserEventEmitter` is used to attach top-level event listeners. For
 * example:
 *
 *   ReactBrowserEventEmitter.putListener('myID', 'onClick', myFunction);
 *
 * This would allocate a "registration" of `('onClick', myFunction)` on 'myID'.
 *
 * @internal
 */
var ReactBrowserEventEmitter = merge(ReactEventEmitterMixin, {

  /**
   * Injectable event backend
   */
  ReactEventListener: null,

  injection: {
    /**
     * @param {object} ReactEventListener
     */
    injectReactEventListener: function(ReactEventListener) {
      ReactEventListener.setHandleTopLevel(
        ReactBrowserEventEmitter.handleTopLevel
      );
      ReactBrowserEventEmitter.ReactEventListener = ReactEventListener;
    }
  },

  /**
   * Sets whether or not any created callbacks should be enabled.
   *
   * @param {boolean} enabled True if callbacks should be enabled.
   */
  setEnabled: function(enabled) {
    if (ReactBrowserEventEmitter.ReactEventListener) {
      ReactBrowserEventEmitter.ReactEventListener.setEnabled(enabled);
    }
  },

  /**
   * @return {boolean} True if callbacks are enabled.
   */
  isEnabled: function() {
    return !!(
      ReactBrowserEventEmitter.ReactEventListener &&
      ReactBrowserEventEmitter.ReactEventListener.isEnabled()
    );
  },

  /**
   * We listen for bubbled touch events on the document object.
   *
   * Firefox v8.01 (and possibly others) exhibited strange behavior when
   * mounting `onmousemove` events at some node that was not the document
   * element. The symptoms were that if your mouse is not moving over something
   * contained within that mount point (for example on the background) the
   * top-level listeners for `onmousemove` won't be called. However, if you
   * register the `mousemove` on the document object, then it will of course
   * catch all `mousemove`s. This along with iOS quirks, justifies restricting
   * top-level listeners to the document object only, at least for these
   * movement types of events and possibly all events.
   *
   * @see http://www.quirksmode.org/blog/archives/2010/09/click_event_del.html
   *
   * Also, `keyup`/`keypress`/`keydown` do not bubble to the window on IE, but
   * they bubble to document.
   *
   * @param {string} registrationName Name of listener (e.g. `onClick`).
   * @param {object} contentDocumentHandle Document which owns the container
   */
  listenTo: function(registrationName, contentDocumentHandle) {
    var mountAt = contentDocumentHandle;
    var isListening = getListeningForDocument(mountAt);
    var dependencies = EventPluginRegistry.
      registrationNameDependencies[registrationName];

    var topLevelTypes = EventConstants.topLevelTypes;
    for (var i = 0, l = dependencies.length; i < l; i++) {
      var dependency = dependencies[i];
      if (!(
            isListening.hasOwnProperty(dependency) &&
            isListening[dependency]
          )) {
        if (dependency === topLevelTypes.topWheel) {
          if (isEventSupported('wheel')) {
            ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
              topLevelTypes.topWheel,
              'wheel',
              mountAt
            );
          } else if (isEventSupported('mousewheel')) {
            ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
              topLevelTypes.topWheel,
              'mousewheel',
              mountAt
            );
          } else {
            // Firefox needs to capture a different mouse scroll event.
            // @see http://www.quirksmode.org/dom/events/tests/scroll.html
            ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
              topLevelTypes.topWheel,
              'DOMMouseScroll',
              mountAt
            );
          }
        } else if (dependency === topLevelTypes.topScroll) {

          if (isEventSupported('scroll', true)) {
            ReactBrowserEventEmitter.ReactEventListener.trapCapturedEvent(
              topLevelTypes.topScroll,
              'scroll',
              mountAt
            );
          } else {
            ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
              topLevelTypes.topScroll,
              'scroll',
              ReactBrowserEventEmitter.ReactEventListener.WINDOW_HANDLE
            );
          }
        } else if (dependency === topLevelTypes.topFocus ||
            dependency === topLevelTypes.topBlur) {

          if (isEventSupported('focus', true)) {
            ReactBrowserEventEmitter.ReactEventListener.trapCapturedEvent(
              topLevelTypes.topFocus,
              'focus',
              mountAt
            );
            ReactBrowserEventEmitter.ReactEventListener.trapCapturedEvent(
              topLevelTypes.topBlur,
              'blur',
              mountAt
            );
          } else if (isEventSupported('focusin')) {
            // IE has `focusin` and `focusout` events which bubble.
            // @see http://www.quirksmode.org/blog/archives/2008/04/delegating_the.html
            ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
              topLevelTypes.topFocus,
              'focusin',
              mountAt
            );
            ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
              topLevelTypes.topBlur,
              'focusout',
              mountAt
            );
          }

          // to make sure blur and focus event listeners are only attached once
          isListening[topLevelTypes.topBlur] = true;
          isListening[topLevelTypes.topFocus] = true;
        } else if (topEventMapping.hasOwnProperty(dependency)) {
          ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
            dependency,
            topEventMapping[dependency],
            mountAt
          );
        }

        isListening[dependency] = true;
      }
    }
  },

  trapBubbledEvent: function(topLevelType, handlerBaseName, handle) {
    return ReactBrowserEventEmitter.ReactEventListener.trapBubbledEvent(
      topLevelType,
      handlerBaseName,
      handle
    );
  },

  trapCapturedEvent: function(topLevelType, handlerBaseName, handle) {
    return ReactBrowserEventEmitter.ReactEventListener.trapCapturedEvent(
      topLevelType,
      handlerBaseName,
      handle
    );
  },

  /**
   * Listens to window scroll and resize events. We cache scroll values so that
   * application code can access them without triggering reflows.
   *
   * NOTE: Scroll events do not bubble.
   *
   * @see http://www.quirksmode.org/dom/events/scroll.html
   */
  ensureScrollValueMonitoring: function(){
    if (!isMonitoringScrollValue) {
      var refresh = ViewportMetrics.refreshScrollValues;
      ReactBrowserEventEmitter.ReactEventListener.monitorScrollValue(refresh);
      isMonitoringScrollValue = true;
    }
  },

  eventNameDispatchConfigs: EventPluginHub.eventNameDispatchConfigs,

  registrationNameModules: EventPluginHub.registrationNameModules,

  putListener: EventPluginHub.putListener,

  getListener: EventPluginHub.getListener,

  deleteListener: EventPluginHub.deleteListener,

  deleteAllListeners: EventPluginHub.deleteAllListeners

});

module.exports = ReactBrowserEventEmitter;

},{"./EventConstants":15,"./EventPluginHub":17,"./EventPluginRegistry":18,"./ReactEventEmitterMixin":55,"./ViewportMetrics":93,"./isEventSupported":121,"./merge":130}],30:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactChildren
 */

"use strict";

var PooledClass = _dereq_("./PooledClass");

var traverseAllChildren = _dereq_("./traverseAllChildren");
var warning = _dereq_("./warning");

var twoArgumentPooler = PooledClass.twoArgumentPooler;
var threeArgumentPooler = PooledClass.threeArgumentPooler;

/**
 * PooledClass representing the bookkeeping associated with performing a child
 * traversal. Allows avoiding binding callbacks.
 *
 * @constructor ForEachBookKeeping
 * @param {!function} forEachFunction Function to perform traversal with.
 * @param {?*} forEachContext Context to perform context with.
 */
function ForEachBookKeeping(forEachFunction, forEachContext) {
  this.forEachFunction = forEachFunction;
  this.forEachContext = forEachContext;
}
PooledClass.addPoolingTo(ForEachBookKeeping, twoArgumentPooler);

function forEachSingleChild(traverseContext, child, name, i) {
  var forEachBookKeeping = traverseContext;
  forEachBookKeeping.forEachFunction.call(
    forEachBookKeeping.forEachContext, child, i);
}

/**
 * Iterates through children that are typically specified as `props.children`.
 *
 * The provided forEachFunc(child, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} forEachFunc.
 * @param {*} forEachContext Context for forEachContext.
 */
function forEachChildren(children, forEachFunc, forEachContext) {
  if (children == null) {
    return children;
  }

  var traverseContext =
    ForEachBookKeeping.getPooled(forEachFunc, forEachContext);
  traverseAllChildren(children, forEachSingleChild, traverseContext);
  ForEachBookKeeping.release(traverseContext);
}

/**
 * PooledClass representing the bookkeeping associated with performing a child
 * mapping. Allows avoiding binding callbacks.
 *
 * @constructor MapBookKeeping
 * @param {!*} mapResult Object containing the ordered map of results.
 * @param {!function} mapFunction Function to perform mapping with.
 * @param {?*} mapContext Context to perform mapping with.
 */
function MapBookKeeping(mapResult, mapFunction, mapContext) {
  this.mapResult = mapResult;
  this.mapFunction = mapFunction;
  this.mapContext = mapContext;
}
PooledClass.addPoolingTo(MapBookKeeping, threeArgumentPooler);

function mapSingleChildIntoContext(traverseContext, child, name, i) {
  var mapBookKeeping = traverseContext;
  var mapResult = mapBookKeeping.mapResult;

  var keyUnique = !mapResult.hasOwnProperty(name);
  ("production" !== "development" ? warning(
    keyUnique,
    'ReactChildren.map(...): Encountered two children with the same key, ' +
    '`%s`. Child keys must be unique; when two children share a key, only ' +
    'the first child will be used.',
    name
  ) : null);

  if (keyUnique) {
    var mappedChild =
      mapBookKeeping.mapFunction.call(mapBookKeeping.mapContext, child, i);
    mapResult[name] = mappedChild;
  }
}

/**
 * Maps children that are typically specified as `props.children`.
 *
 * The provided mapFunction(child, key, index) will be called for each
 * leaf child.
 *
 * TODO: This may likely break any calls to `ReactChildren.map` that were
 * previously relying on the fact that we guarded against null children.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} mapFunction.
 * @param {*} mapContext Context for mapFunction.
 * @return {object} Object containing the ordered map of results.
 */
function mapChildren(children, func, context) {
  if (children == null) {
    return children;
  }

  var mapResult = {};
  var traverseContext = MapBookKeeping.getPooled(mapResult, func, context);
  traverseAllChildren(children, mapSingleChildIntoContext, traverseContext);
  MapBookKeeping.release(traverseContext);
  return mapResult;
}

function forEachSingleChildDummy(traverseContext, child, name, i) {
  return null;
}

/**
 * Count the number of children that are typically specified as
 * `props.children`.
 *
 * @param {?*} children Children tree container.
 * @return {number} The number of children.
 */
function countChildren(children, context) {
  return traverseAllChildren(children, forEachSingleChildDummy, null);
}

var ReactChildren = {
  forEach: forEachChildren,
  map: mapChildren,
  count: countChildren
};

module.exports = ReactChildren;

},{"./PooledClass":26,"./traverseAllChildren":142,"./warning":143}],31:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactComponent
 */

"use strict";

var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactOwner = _dereq_("./ReactOwner");
var ReactUpdates = _dereq_("./ReactUpdates");

var invariant = _dereq_("./invariant");
var keyMirror = _dereq_("./keyMirror");
var merge = _dereq_("./merge");

/**
 * Every React component is in one of these life cycles.
 */
var ComponentLifeCycle = keyMirror({
  /**
   * Mounted components have a DOM node representation and are capable of
   * receiving new props.
   */
  MOUNTED: null,
  /**
   * Unmounted components are inactive and cannot receive new props.
   */
  UNMOUNTED: null
});

var injected = false;

/**
 * Optionally injectable environment dependent cleanup hook. (server vs.
 * browser etc). Example: A browser system caches DOM nodes based on component
 * ID and must remove that cache entry when this instance is unmounted.
 *
 * @private
 */
var unmountIDFromEnvironment = null;

/**
 * The "image" of a component tree, is the platform specific (typically
 * serialized) data that represents a tree of lower level UI building blocks.
 * On the web, this "image" is HTML markup which describes a construction of
 * low level `div` and `span` nodes. Other platforms may have different
 * encoding of this "image". This must be injected.
 *
 * @private
 */
var mountImageIntoNode = null;

/**
 * Components are the basic units of composition in React.
 *
 * Every component accepts a set of keyed input parameters known as "props" that
 * are initialized by the constructor. Once a component is mounted, the props
 * can be mutated using `setProps` or `replaceProps`.
 *
 * Every component is capable of the following operations:
 *
 *   `mountComponent`
 *     Initializes the component, renders markup, and registers event listeners.
 *
 *   `receiveComponent`
 *     Updates the rendered DOM nodes to match the given component.
 *
 *   `unmountComponent`
 *     Releases any resources allocated by this component.
 *
 * Components can also be "owned" by other components. Being owned by another
 * component means being constructed by that component. This is different from
 * being the child of a component, which means having a DOM representation that
 * is a child of the DOM representation of that component.
 *
 * @class ReactComponent
 */
var ReactComponent = {

  injection: {
    injectEnvironment: function(ReactComponentEnvironment) {
      ("production" !== "development" ? invariant(
        !injected,
        'ReactComponent: injectEnvironment() can only be called once.'
      ) : invariant(!injected));
      mountImageIntoNode = ReactComponentEnvironment.mountImageIntoNode;
      unmountIDFromEnvironment =
        ReactComponentEnvironment.unmountIDFromEnvironment;
      ReactComponent.BackendIDOperations =
        ReactComponentEnvironment.BackendIDOperations;
      injected = true;
    }
  },

  /**
   * @internal
   */
  LifeCycle: ComponentLifeCycle,

  /**
   * Injected module that provides ability to mutate individual properties.
   * Injected into the base class because many different subclasses need access
   * to this.
   *
   * @internal
   */
  BackendIDOperations: null,

  /**
   * Base functionality for every ReactComponent constructor. Mixed into the
   * `ReactComponent` prototype, but exposed statically for easy access.
   *
   * @lends {ReactComponent.prototype}
   */
  Mixin: {

    /**
     * Checks whether or not this component is mounted.
     *
     * @return {boolean} True if mounted, false otherwise.
     * @final
     * @protected
     */
    isMounted: function() {
      return this._lifeCycleState === ComponentLifeCycle.MOUNTED;
    },

    /**
     * Sets a subset of the props.
     *
     * @param {object} partialProps Subset of the next props.
     * @param {?function} callback Called after props are updated.
     * @final
     * @public
     */
    setProps: function(partialProps, callback) {
      // Merge with the pending descriptor if it exists, otherwise with existing
      // descriptor props.
      var descriptor = this._pendingDescriptor || this._descriptor;
      this.replaceProps(
        merge(descriptor.props, partialProps),
        callback
      );
    },

    /**
     * Replaces all of the props.
     *
     * @param {object} props New props.
     * @param {?function} callback Called after props are updated.
     * @final
     * @public
     */
    replaceProps: function(props, callback) {
      ("production" !== "development" ? invariant(
        this.isMounted(),
        'replaceProps(...): Can only update a mounted component.'
      ) : invariant(this.isMounted()));
      ("production" !== "development" ? invariant(
        this._mountDepth === 0,
        'replaceProps(...): You called `setProps` or `replaceProps` on a ' +
        'component with a parent. This is an anti-pattern since props will ' +
        'get reactively updated when rendered. Instead, change the owner\'s ' +
        '`render` method to pass the correct value as props to the component ' +
        'where it is created.'
      ) : invariant(this._mountDepth === 0));
      // This is a deoptimized path. We optimize for always having a descriptor.
      // This creates an extra internal descriptor.
      this._pendingDescriptor = ReactDescriptor.cloneAndReplaceProps(
        this._pendingDescriptor || this._descriptor,
        props
      );
      ReactUpdates.enqueueUpdate(this, callback);
    },

    /**
     * Schedule a partial update to the props. Only used for internal testing.
     *
     * @param {object} partialProps Subset of the next props.
     * @param {?function} callback Called after props are updated.
     * @final
     * @internal
     */
    _setPropsInternal: function(partialProps, callback) {
      // This is a deoptimized path. We optimize for always having a descriptor.
      // This creates an extra internal descriptor.
      var descriptor = this._pendingDescriptor || this._descriptor;
      this._pendingDescriptor = ReactDescriptor.cloneAndReplaceProps(
        descriptor,
        merge(descriptor.props, partialProps)
      );
      ReactUpdates.enqueueUpdate(this, callback);
    },

    /**
     * Base constructor for all React components.
     *
     * Subclasses that override this method should make sure to invoke
     * `ReactComponent.Mixin.construct.call(this, ...)`.
     *
     * @param {ReactDescriptor} descriptor
     * @internal
     */
    construct: function(descriptor) {
      // This is the public exposed props object after it has been processed
      // with default props. The descriptor's props represents the true internal
      // state of the props.
      this.props = descriptor.props;
      // Record the component responsible for creating this component.
      // This is accessible through the descriptor but we maintain an extra
      // field for compatibility with devtools and as a way to make an
      // incremental update. TODO: Consider deprecating this field.
      this._owner = descriptor._owner;

      // All components start unmounted.
      this._lifeCycleState = ComponentLifeCycle.UNMOUNTED;

      // See ReactUpdates.
      this._pendingCallbacks = null;

      // We keep the old descriptor and a reference to the pending descriptor
      // to track updates.
      this._descriptor = descriptor;
      this._pendingDescriptor = null;
    },

    /**
     * Initializes the component, renders markup, and registers event listeners.
     *
     * NOTE: This does not insert any nodes into the DOM.
     *
     * Subclasses that override this method should make sure to invoke
     * `ReactComponent.Mixin.mountComponent.call(this, ...)`.
     *
     * @param {string} rootID DOM ID of the root node.
     * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
     * @param {number} mountDepth number of components in the owner hierarchy.
     * @return {?string} Rendered markup to be inserted into the DOM.
     * @internal
     */
    mountComponent: function(rootID, transaction, mountDepth) {
      ("production" !== "development" ? invariant(
        !this.isMounted(),
        'mountComponent(%s, ...): Can only mount an unmounted component. ' +
        'Make sure to avoid storing components between renders or reusing a ' +
        'single component instance in multiple places.',
        rootID
      ) : invariant(!this.isMounted()));
      var props = this._descriptor.props;
      if (props.ref != null) {
        var owner = this._descriptor._owner;
        ReactOwner.addComponentAsRefTo(this, props.ref, owner);
      }
      this._rootNodeID = rootID;
      this._lifeCycleState = ComponentLifeCycle.MOUNTED;
      this._mountDepth = mountDepth;
      // Effectively: return '';
    },

    /**
     * Releases any resources allocated by `mountComponent`.
     *
     * NOTE: This does not remove any nodes from the DOM.
     *
     * Subclasses that override this method should make sure to invoke
     * `ReactComponent.Mixin.unmountComponent.call(this)`.
     *
     * @internal
     */
    unmountComponent: function() {
      ("production" !== "development" ? invariant(
        this.isMounted(),
        'unmountComponent(): Can only unmount a mounted component.'
      ) : invariant(this.isMounted()));
      var props = this.props;
      if (props.ref != null) {
        ReactOwner.removeComponentAsRefFrom(this, props.ref, this._owner);
      }
      unmountIDFromEnvironment(this._rootNodeID);
      this._rootNodeID = null;
      this._lifeCycleState = ComponentLifeCycle.UNMOUNTED;
    },

    /**
     * Given a new instance of this component, updates the rendered DOM nodes
     * as if that instance was rendered instead.
     *
     * Subclasses that override this method should make sure to invoke
     * `ReactComponent.Mixin.receiveComponent.call(this, ...)`.
     *
     * @param {object} nextComponent Next set of properties.
     * @param {ReactReconcileTransaction} transaction
     * @internal
     */
    receiveComponent: function(nextDescriptor, transaction) {
      ("production" !== "development" ? invariant(
        this.isMounted(),
        'receiveComponent(...): Can only update a mounted component.'
      ) : invariant(this.isMounted()));
      this._pendingDescriptor = nextDescriptor;
      this.performUpdateIfNecessary(transaction);
    },

    /**
     * If `_pendingDescriptor` is set, update the component.
     *
     * @param {ReactReconcileTransaction} transaction
     * @internal
     */
    performUpdateIfNecessary: function(transaction) {
      if (this._pendingDescriptor == null) {
        return;
      }
      var prevDescriptor = this._descriptor;
      var nextDescriptor = this._pendingDescriptor;
      this._descriptor = nextDescriptor;
      this.props = nextDescriptor.props;
      this._owner = nextDescriptor._owner;
      this._pendingDescriptor = null;
      this.updateComponent(transaction, prevDescriptor);
    },

    /**
     * Updates the component's currently mounted representation.
     *
     * @param {ReactReconcileTransaction} transaction
     * @param {object} prevDescriptor
     * @internal
     */
    updateComponent: function(transaction, prevDescriptor) {
      var nextDescriptor = this._descriptor;

      // If either the owner or a `ref` has changed, make sure the newest owner
      // has stored a reference to `this`, and the previous owner (if different)
      // has forgotten the reference to `this`. We use the descriptor instead
      // of the public this.props because the post processing cannot determine
      // a ref. The ref conceptually lives on the descriptor.

      // TODO: Should this even be possible? The owner cannot change because
      // it's forbidden by shouldUpdateReactComponent. The ref can change
      // if you swap the keys of but not the refs. Reconsider where this check
      // is made. It probably belongs where the key checking and
      // instantiateReactComponent is done.

      if (nextDescriptor._owner !== prevDescriptor._owner ||
          nextDescriptor.props.ref !== prevDescriptor.props.ref) {
        if (prevDescriptor.props.ref != null) {
          ReactOwner.removeComponentAsRefFrom(
            this, prevDescriptor.props.ref, prevDescriptor._owner
          );
        }
        // Correct, even if the owner is the same, and only the ref has changed.
        if (nextDescriptor.props.ref != null) {
          ReactOwner.addComponentAsRefTo(
            this,
            nextDescriptor.props.ref,
            nextDescriptor._owner
          );
        }
      }
    },

    /**
     * Mounts this component and inserts it into the DOM.
     *
     * @param {string} rootID DOM ID of the root node.
     * @param {DOMElement} container DOM element to mount into.
     * @param {boolean} shouldReuseMarkup If true, do not insert markup
     * @final
     * @internal
     * @see {ReactMount.renderComponent}
     */
    mountComponentIntoNode: function(rootID, container, shouldReuseMarkup) {
      var transaction = ReactUpdates.ReactReconcileTransaction.getPooled();
      transaction.perform(
        this._mountComponentIntoNode,
        this,
        rootID,
        container,
        transaction,
        shouldReuseMarkup
      );
      ReactUpdates.ReactReconcileTransaction.release(transaction);
    },

    /**
     * @param {string} rootID DOM ID of the root node.
     * @param {DOMElement} container DOM element to mount into.
     * @param {ReactReconcileTransaction} transaction
     * @param {boolean} shouldReuseMarkup If true, do not insert markup
     * @final
     * @private
     */
    _mountComponentIntoNode: function(
        rootID,
        container,
        transaction,
        shouldReuseMarkup) {
      var markup = this.mountComponent(rootID, transaction, 0);
      mountImageIntoNode(markup, container, shouldReuseMarkup);
    },

    /**
     * Checks if this component is owned by the supplied `owner` component.
     *
     * @param {ReactComponent} owner Component to check.
     * @return {boolean} True if `owners` owns this component.
     * @final
     * @internal
     */
    isOwnedBy: function(owner) {
      return this._owner === owner;
    },

    /**
     * Gets another component, that shares the same owner as this one, by ref.
     *
     * @param {string} ref of a sibling Component.
     * @return {?ReactComponent} the actual sibling Component.
     * @final
     * @internal
     */
    getSiblingByRef: function(ref) {
      var owner = this._owner;
      if (!owner || !owner.refs) {
        return null;
      }
      return owner.refs[ref];
    }
  }
};

module.exports = ReactComponent;

},{"./ReactDescriptor":51,"./ReactOwner":64,"./ReactUpdates":76,"./invariant":120,"./keyMirror":126,"./merge":130}],32:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactComponentBrowserEnvironment
 */

/*jslint evil: true */

"use strict";

var ReactDOMIDOperations = _dereq_("./ReactDOMIDOperations");
var ReactMarkupChecksum = _dereq_("./ReactMarkupChecksum");
var ReactMount = _dereq_("./ReactMount");
var ReactPerf = _dereq_("./ReactPerf");
var ReactReconcileTransaction = _dereq_("./ReactReconcileTransaction");

var getReactRootElementInContainer = _dereq_("./getReactRootElementInContainer");
var invariant = _dereq_("./invariant");
var setInnerHTML = _dereq_("./setInnerHTML");


var ELEMENT_NODE_TYPE = 1;
var DOC_NODE_TYPE = 9;


/**
 * Abstracts away all functionality of `ReactComponent` requires knowledge of
 * the browser context.
 */
var ReactComponentBrowserEnvironment = {
  ReactReconcileTransaction: ReactReconcileTransaction,

  BackendIDOperations: ReactDOMIDOperations,

  /**
   * If a particular environment requires that some resources be cleaned up,
   * specify this in the injected Mixin. In the DOM, we would likely want to
   * purge any cached node ID lookups.
   *
   * @private
   */
  unmountIDFromEnvironment: function(rootNodeID) {
    ReactMount.purgeID(rootNodeID);
  },

  /**
   * @param {string} markup Markup string to place into the DOM Element.
   * @param {DOMElement} container DOM Element to insert markup into.
   * @param {boolean} shouldReuseMarkup Should reuse the existing markup in the
   * container if possible.
   */
  mountImageIntoNode: ReactPerf.measure(
    'ReactComponentBrowserEnvironment',
    'mountImageIntoNode',
    function(markup, container, shouldReuseMarkup) {
      ("production" !== "development" ? invariant(
        container && (
          container.nodeType === ELEMENT_NODE_TYPE ||
            container.nodeType === DOC_NODE_TYPE
        ),
        'mountComponentIntoNode(...): Target container is not valid.'
      ) : invariant(container && (
        container.nodeType === ELEMENT_NODE_TYPE ||
          container.nodeType === DOC_NODE_TYPE
      )));

      if (shouldReuseMarkup) {
        if (ReactMarkupChecksum.canReuseMarkup(
          markup,
          getReactRootElementInContainer(container))) {
          return;
        } else {
          ("production" !== "development" ? invariant(
            container.nodeType !== DOC_NODE_TYPE,
            'You\'re trying to render a component to the document using ' +
            'server rendering but the checksum was invalid. This usually ' +
            'means you rendered a different component type or props on ' +
            'the client from the one on the server, or your render() ' +
            'methods are impure. React cannot handle this case due to ' +
            'cross-browser quirks by rendering at the document root. You ' +
            'should look for environment dependent code in your components ' +
            'and ensure the props are the same client and server side.'
          ) : invariant(container.nodeType !== DOC_NODE_TYPE));

          if ("production" !== "development") {
            console.warn(
              'React attempted to use reuse markup in a container but the ' +
              'checksum was invalid. This generally means that you are ' +
              'using server rendering and the markup generated on the ' +
              'server was not what the client was expecting. React injected ' +
              'new markup to compensate which works but you have lost many ' +
              'of the benefits of server rendering. Instead, figure out ' +
              'why the markup being generated is different on the client ' +
              'or server.'
            );
          }
        }
      }

      ("production" !== "development" ? invariant(
        container.nodeType !== DOC_NODE_TYPE,
        'You\'re trying to render a component to the document but ' +
          'you didn\'t use server rendering. We can\'t do this ' +
          'without using server rendering due to cross-browser quirks. ' +
          'See renderComponentToString() for server rendering.'
      ) : invariant(container.nodeType !== DOC_NODE_TYPE));

      setInnerHTML(container, markup);
    }
  )
};

module.exports = ReactComponentBrowserEnvironment;

},{"./ReactDOMIDOperations":40,"./ReactMarkupChecksum":60,"./ReactMount":61,"./ReactPerf":65,"./ReactReconcileTransaction":71,"./getReactRootElementInContainer":114,"./invariant":120,"./setInnerHTML":138}],33:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactCompositeComponent
 */

"use strict";

var ReactComponent = _dereq_("./ReactComponent");
var ReactContext = _dereq_("./ReactContext");
var ReactCurrentOwner = _dereq_("./ReactCurrentOwner");
var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactDescriptorValidator = _dereq_("./ReactDescriptorValidator");
var ReactEmptyComponent = _dereq_("./ReactEmptyComponent");
var ReactErrorUtils = _dereq_("./ReactErrorUtils");
var ReactOwner = _dereq_("./ReactOwner");
var ReactPerf = _dereq_("./ReactPerf");
var ReactPropTransferer = _dereq_("./ReactPropTransferer");
var ReactPropTypeLocations = _dereq_("./ReactPropTypeLocations");
var ReactPropTypeLocationNames = _dereq_("./ReactPropTypeLocationNames");
var ReactUpdates = _dereq_("./ReactUpdates");

var instantiateReactComponent = _dereq_("./instantiateReactComponent");
var invariant = _dereq_("./invariant");
var keyMirror = _dereq_("./keyMirror");
var merge = _dereq_("./merge");
var mixInto = _dereq_("./mixInto");
var monitorCodeUse = _dereq_("./monitorCodeUse");
var mapObject = _dereq_("./mapObject");
var shouldUpdateReactComponent = _dereq_("./shouldUpdateReactComponent");
var warning = _dereq_("./warning");

/**
 * Policies that describe methods in `ReactCompositeComponentInterface`.
 */
var SpecPolicy = keyMirror({
  /**
   * These methods may be defined only once by the class specification or mixin.
   */
  DEFINE_ONCE: null,
  /**
   * These methods may be defined by both the class specification and mixins.
   * Subsequent definitions will be chained. These methods must return void.
   */
  DEFINE_MANY: null,
  /**
   * These methods are overriding the base ReactCompositeComponent class.
   */
  OVERRIDE_BASE: null,
  /**
   * These methods are similar to DEFINE_MANY, except we assume they return
   * objects. We try to merge the keys of the return values of all the mixed in
   * functions. If there is a key conflict we throw.
   */
  DEFINE_MANY_MERGED: null
});


var injectedMixins = [];

/**
 * Composite components are higher-level components that compose other composite
 * or native components.
 *
 * To create a new type of `ReactCompositeComponent`, pass a specification of
 * your new class to `React.createClass`. The only requirement of your class
 * specification is that you implement a `render` method.
 *
 *   var MyComponent = React.createClass({
 *     render: function() {
 *       return <div>Hello World</div>;
 *     }
 *   });
 *
 * The class specification supports a specific protocol of methods that have
 * special meaning (e.g. `render`). See `ReactCompositeComponentInterface` for
 * more the comprehensive protocol. Any other properties and methods in the
 * class specification will available on the prototype.
 *
 * @interface ReactCompositeComponentInterface
 * @internal
 */
var ReactCompositeComponentInterface = {

  /**
   * An array of Mixin objects to include when defining your component.
   *
   * @type {array}
   * @optional
   */
  mixins: SpecPolicy.DEFINE_MANY,

  /**
   * An object containing properties and methods that should be defined on
   * the component's constructor instead of its prototype (static methods).
   *
   * @type {object}
   * @optional
   */
  statics: SpecPolicy.DEFINE_MANY,

  /**
   * Definition of prop types for this component.
   *
   * @type {object}
   * @optional
   */
  propTypes: SpecPolicy.DEFINE_MANY,

  /**
   * Definition of context types for this component.
   *
   * @type {object}
   * @optional
   */
  contextTypes: SpecPolicy.DEFINE_MANY,

  /**
   * Definition of context types this component sets for its children.
   *
   * @type {object}
   * @optional
   */
  childContextTypes: SpecPolicy.DEFINE_MANY,

  // ==== Definition methods ====

  /**
   * Invoked when the component is mounted. Values in the mapping will be set on
   * `this.props` if that prop is not specified (i.e. using an `in` check).
   *
   * This method is invoked before `getInitialState` and therefore cannot rely
   * on `this.state` or use `this.setState`.
   *
   * @return {object}
   * @optional
   */
  getDefaultProps: SpecPolicy.DEFINE_MANY_MERGED,

  /**
   * Invoked once before the component is mounted. The return value will be used
   * as the initial value of `this.state`.
   *
   *   getInitialState: function() {
   *     return {
   *       isOn: false,
   *       fooBaz: new BazFoo()
   *     }
   *   }
   *
   * @return {object}
   * @optional
   */
  getInitialState: SpecPolicy.DEFINE_MANY_MERGED,

  /**
   * @return {object}
   * @optional
   */
  getChildContext: SpecPolicy.DEFINE_MANY_MERGED,

  /**
   * Uses props from `this.props` and state from `this.state` to render the
   * structure of the component.
   *
   * No guarantees are made about when or how often this method is invoked, so
   * it must not have side effects.
   *
   *   render: function() {
   *     var name = this.props.name;
   *     return <div>Hello, {name}!</div>;
   *   }
   *
   * @return {ReactComponent}
   * @nosideeffects
   * @required
   */
  render: SpecPolicy.DEFINE_ONCE,



  // ==== Delegate methods ====

  /**
   * Invoked when the component is initially created and about to be mounted.
   * This may have side effects, but any external subscriptions or data created
   * by this method must be cleaned up in `componentWillUnmount`.
   *
   * @optional
   */
  componentWillMount: SpecPolicy.DEFINE_MANY,

  /**
   * Invoked when the component has been mounted and has a DOM representation.
   * However, there is no guarantee that the DOM node is in the document.
   *
   * Use this as an opportunity to operate on the DOM when the component has
   * been mounted (initialized and rendered) for the first time.
   *
   * @param {DOMElement} rootNode DOM element representing the component.
   * @optional
   */
  componentDidMount: SpecPolicy.DEFINE_MANY,

  /**
   * Invoked before the component receives new props.
   *
   * Use this as an opportunity to react to a prop transition by updating the
   * state using `this.setState`. Current props are accessed via `this.props`.
   *
   *   componentWillReceiveProps: function(nextProps, nextContext) {
   *     this.setState({
   *       likesIncreasing: nextProps.likeCount > this.props.likeCount
   *     });
   *   }
   *
   * NOTE: There is no equivalent `componentWillReceiveState`. An incoming prop
   * transition may cause a state change, but the opposite is not true. If you
   * need it, you are probably looking for `componentWillUpdate`.
   *
   * @param {object} nextProps
   * @optional
   */
  componentWillReceiveProps: SpecPolicy.DEFINE_MANY,

  /**
   * Invoked while deciding if the component should be updated as a result of
   * receiving new props, state and/or context.
   *
   * Use this as an opportunity to `return false` when you're certain that the
   * transition to the new props/state/context will not require a component
   * update.
   *
   *   shouldComponentUpdate: function(nextProps, nextState, nextContext) {
   *     return !equal(nextProps, this.props) ||
   *       !equal(nextState, this.state) ||
   *       !equal(nextContext, this.context);
   *   }
   *
   * @param {object} nextProps
   * @param {?object} nextState
   * @param {?object} nextContext
   * @return {boolean} True if the component should update.
   * @optional
   */
  shouldComponentUpdate: SpecPolicy.DEFINE_ONCE,

  /**
   * Invoked when the component is about to update due to a transition from
   * `this.props`, `this.state` and `this.context` to `nextProps`, `nextState`
   * and `nextContext`.
   *
   * Use this as an opportunity to perform preparation before an update occurs.
   *
   * NOTE: You **cannot** use `this.setState()` in this method.
   *
   * @param {object} nextProps
   * @param {?object} nextState
   * @param {?object} nextContext
   * @param {ReactReconcileTransaction} transaction
   * @optional
   */
  componentWillUpdate: SpecPolicy.DEFINE_MANY,

  /**
   * Invoked when the component's DOM representation has been updated.
   *
   * Use this as an opportunity to operate on the DOM when the component has
   * been updated.
   *
   * @param {object} prevProps
   * @param {?object} prevState
   * @param {?object} prevContext
   * @param {DOMElement} rootNode DOM element representing the component.
   * @optional
   */
  componentDidUpdate: SpecPolicy.DEFINE_MANY,

  /**
   * Invoked when the component is about to be removed from its parent and have
   * its DOM representation destroyed.
   *
   * Use this as an opportunity to deallocate any external resources.
   *
   * NOTE: There is no `componentDidUnmount` since your component will have been
   * destroyed by that point.
   *
   * @optional
   */
  componentWillUnmount: SpecPolicy.DEFINE_MANY,



  // ==== Advanced methods ====

  /**
   * Updates the component's currently mounted DOM representation.
   *
   * By default, this implements React's rendering and reconciliation algorithm.
   * Sophisticated clients may wish to override this.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   * @overridable
   */
  updateComponent: SpecPolicy.OVERRIDE_BASE

};

/**
 * Mapping from class specification keys to special processing functions.
 *
 * Although these are declared like instance properties in the specification
 * when defining classes using `React.createClass`, they are actually static
 * and are accessible on the constructor instead of the prototype. Despite
 * being static, they must be defined outside of the "statics" key under
 * which all other static methods are defined.
 */
var RESERVED_SPEC_KEYS = {
  displayName: function(Constructor, displayName) {
    Constructor.displayName = displayName;
  },
  mixins: function(Constructor, mixins) {
    if (mixins) {
      for (var i = 0; i < mixins.length; i++) {
        mixSpecIntoComponent(Constructor, mixins[i]);
      }
    }
  },
  childContextTypes: function(Constructor, childContextTypes) {
    validateTypeDef(
      Constructor,
      childContextTypes,
      ReactPropTypeLocations.childContext
    );
    Constructor.childContextTypes = merge(
      Constructor.childContextTypes,
      childContextTypes
    );
  },
  contextTypes: function(Constructor, contextTypes) {
    validateTypeDef(
      Constructor,
      contextTypes,
      ReactPropTypeLocations.context
    );
    Constructor.contextTypes = merge(Constructor.contextTypes, contextTypes);
  },
  /**
   * Special case getDefaultProps which should move into statics but requires
   * automatic merging.
   */
  getDefaultProps: function(Constructor, getDefaultProps) {
    if (Constructor.getDefaultProps) {
      Constructor.getDefaultProps = createMergedResultFunction(
        Constructor.getDefaultProps,
        getDefaultProps
      );
    } else {
      Constructor.getDefaultProps = getDefaultProps;
    }
  },
  propTypes: function(Constructor, propTypes) {
    validateTypeDef(
      Constructor,
      propTypes,
      ReactPropTypeLocations.prop
    );
    Constructor.propTypes = merge(Constructor.propTypes, propTypes);
  },
  statics: function(Constructor, statics) {
    mixStaticSpecIntoComponent(Constructor, statics);
  }
};

function getDeclarationErrorAddendum(component) {
  var owner = component._owner || null;
  if (owner && owner.constructor && owner.constructor.displayName) {
    return ' Check the render method of `' + owner.constructor.displayName +
      '`.';
  }
  return '';
}

function validateTypeDef(Constructor, typeDef, location) {
  for (var propName in typeDef) {
    if (typeDef.hasOwnProperty(propName)) {
      ("production" !== "development" ? invariant(
        typeof typeDef[propName] == 'function',
        '%s: %s type `%s` is invalid; it must be a function, usually from ' +
        'React.PropTypes.',
        Constructor.displayName || 'ReactCompositeComponent',
        ReactPropTypeLocationNames[location],
        propName
      ) : invariant(typeof typeDef[propName] == 'function'));
    }
  }
}

function validateMethodOverride(proto, name) {
  var specPolicy = ReactCompositeComponentInterface.hasOwnProperty(name) ?
    ReactCompositeComponentInterface[name] :
    null;

  // Disallow overriding of base class methods unless explicitly allowed.
  if (ReactCompositeComponentMixin.hasOwnProperty(name)) {
    ("production" !== "development" ? invariant(
      specPolicy === SpecPolicy.OVERRIDE_BASE,
      'ReactCompositeComponentInterface: You are attempting to override ' +
      '`%s` from your class specification. Ensure that your method names ' +
      'do not overlap with React methods.',
      name
    ) : invariant(specPolicy === SpecPolicy.OVERRIDE_BASE));
  }

  // Disallow defining methods more than once unless explicitly allowed.
  if (proto.hasOwnProperty(name)) {
    ("production" !== "development" ? invariant(
      specPolicy === SpecPolicy.DEFINE_MANY ||
      specPolicy === SpecPolicy.DEFINE_MANY_MERGED,
      'ReactCompositeComponentInterface: You are attempting to define ' +
      '`%s` on your component more than once. This conflict may be due ' +
      'to a mixin.',
      name
    ) : invariant(specPolicy === SpecPolicy.DEFINE_MANY ||
    specPolicy === SpecPolicy.DEFINE_MANY_MERGED));
  }
}

function validateLifeCycleOnReplaceState(instance) {
  var compositeLifeCycleState = instance._compositeLifeCycleState;
  ("production" !== "development" ? invariant(
    instance.isMounted() ||
      compositeLifeCycleState === CompositeLifeCycle.MOUNTING,
    'replaceState(...): Can only update a mounted or mounting component.'
  ) : invariant(instance.isMounted() ||
    compositeLifeCycleState === CompositeLifeCycle.MOUNTING));
  ("production" !== "development" ? invariant(compositeLifeCycleState !== CompositeLifeCycle.RECEIVING_STATE,
    'replaceState(...): Cannot update during an existing state transition ' +
    '(such as within `render`). This could potentially cause an infinite ' +
    'loop so it is forbidden.'
  ) : invariant(compositeLifeCycleState !== CompositeLifeCycle.RECEIVING_STATE));
  ("production" !== "development" ? invariant(compositeLifeCycleState !== CompositeLifeCycle.UNMOUNTING,
    'replaceState(...): Cannot update while unmounting component. This ' +
    'usually means you called setState() on an unmounted component.'
  ) : invariant(compositeLifeCycleState !== CompositeLifeCycle.UNMOUNTING));
}

/**
 * Custom version of `mixInto` which handles policy validation and reserved
 * specification keys when building `ReactCompositeComponent` classses.
 */
function mixSpecIntoComponent(Constructor, spec) {
  ("production" !== "development" ? invariant(
    !ReactDescriptor.isValidFactory(spec),
    'ReactCompositeComponent: You\'re attempting to ' +
    'use a component class as a mixin. Instead, just use a regular object.'
  ) : invariant(!ReactDescriptor.isValidFactory(spec)));
  ("production" !== "development" ? invariant(
    !ReactDescriptor.isValidDescriptor(spec),
    'ReactCompositeComponent: You\'re attempting to ' +
    'use a component as a mixin. Instead, just use a regular object.'
  ) : invariant(!ReactDescriptor.isValidDescriptor(spec)));

  var proto = Constructor.prototype;
  for (var name in spec) {
    var property = spec[name];
    if (!spec.hasOwnProperty(name)) {
      continue;
    }

    validateMethodOverride(proto, name);

    if (RESERVED_SPEC_KEYS.hasOwnProperty(name)) {
      RESERVED_SPEC_KEYS[name](Constructor, property);
    } else {
      // Setup methods on prototype:
      // The following member methods should not be automatically bound:
      // 1. Expected ReactCompositeComponent methods (in the "interface").
      // 2. Overridden methods (that were mixed in).
      var isCompositeComponentMethod =
        ReactCompositeComponentInterface.hasOwnProperty(name);
      var isAlreadyDefined = proto.hasOwnProperty(name);
      var markedDontBind = property && property.__reactDontBind;
      var isFunction = typeof property === 'function';
      var shouldAutoBind =
        isFunction &&
        !isCompositeComponentMethod &&
        !isAlreadyDefined &&
        !markedDontBind;

      if (shouldAutoBind) {
        if (!proto.__reactAutoBindMap) {
          proto.__reactAutoBindMap = {};
        }
        proto.__reactAutoBindMap[name] = property;
        proto[name] = property;
      } else {
        if (isAlreadyDefined) {
          var specPolicy = ReactCompositeComponentInterface[name];

          // These cases should already be caught by validateMethodOverride
          ("production" !== "development" ? invariant(
            isCompositeComponentMethod && (
              specPolicy === SpecPolicy.DEFINE_MANY_MERGED ||
              specPolicy === SpecPolicy.DEFINE_MANY
            ),
            'ReactCompositeComponent: Unexpected spec policy %s for key %s ' +
            'when mixing in component specs.',
            specPolicy,
            name
          ) : invariant(isCompositeComponentMethod && (
            specPolicy === SpecPolicy.DEFINE_MANY_MERGED ||
            specPolicy === SpecPolicy.DEFINE_MANY
          )));

          // For methods which are defined more than once, call the existing
          // methods before calling the new property, merging if appropriate.
          if (specPolicy === SpecPolicy.DEFINE_MANY_MERGED) {
            proto[name] = createMergedResultFunction(proto[name], property);
          } else if (specPolicy === SpecPolicy.DEFINE_MANY) {
            proto[name] = createChainedFunction(proto[name], property);
          }
        } else {
          proto[name] = property;
          if ("production" !== "development") {
            // Add verbose displayName to the function, which helps when looking
            // at profiling tools.
            if (typeof property === 'function' && spec.displayName) {
              proto[name].displayName = spec.displayName + '_' + name;
            }
          }
        }
      }
    }
  }
}

function mixStaticSpecIntoComponent(Constructor, statics) {
  if (!statics) {
    return;
  }
  for (var name in statics) {
    var property = statics[name];
    if (!statics.hasOwnProperty(name)) {
      continue;
    }

    var isInherited = name in Constructor;
    var result = property;
    if (isInherited) {
      var existingProperty = Constructor[name];
      var existingType = typeof existingProperty;
      var propertyType = typeof property;
      ("production" !== "development" ? invariant(
        existingType === 'function' && propertyType === 'function',
        'ReactCompositeComponent: You are attempting to define ' +
        '`%s` on your component more than once, but that is only supported ' +
        'for functions, which are chained together. This conflict may be ' +
        'due to a mixin.',
        name
      ) : invariant(existingType === 'function' && propertyType === 'function'));
      result = createChainedFunction(existingProperty, property);
    }
    Constructor[name] = result;
  }
}

/**
 * Merge two objects, but throw if both contain the same key.
 *
 * @param {object} one The first object, which is mutated.
 * @param {object} two The second object
 * @return {object} one after it has been mutated to contain everything in two.
 */
function mergeObjectsWithNoDuplicateKeys(one, two) {
  ("production" !== "development" ? invariant(
    one && two && typeof one === 'object' && typeof two === 'object',
    'mergeObjectsWithNoDuplicateKeys(): Cannot merge non-objects'
  ) : invariant(one && two && typeof one === 'object' && typeof two === 'object'));

  mapObject(two, function(value, key) {
    ("production" !== "development" ? invariant(
      one[key] === undefined,
      'mergeObjectsWithNoDuplicateKeys(): ' +
      'Tried to merge two objects with the same key: %s',
      key
    ) : invariant(one[key] === undefined));
    one[key] = value;
  });
  return one;
}

/**
 * Creates a function that invokes two functions and merges their return values.
 *
 * @param {function} one Function to invoke first.
 * @param {function} two Function to invoke second.
 * @return {function} Function that invokes the two argument functions.
 * @private
 */
function createMergedResultFunction(one, two) {
  return function mergedResult() {
    var a = one.apply(this, arguments);
    var b = two.apply(this, arguments);
    if (a == null) {
      return b;
    } else if (b == null) {
      return a;
    }
    return mergeObjectsWithNoDuplicateKeys(a, b);
  };
}

/**
 * Creates a function that invokes two functions and ignores their return vales.
 *
 * @param {function} one Function to invoke first.
 * @param {function} two Function to invoke second.
 * @return {function} Function that invokes the two argument functions.
 * @private
 */
function createChainedFunction(one, two) {
  return function chainedFunction() {
    one.apply(this, arguments);
    two.apply(this, arguments);
  };
}

/**
 * `ReactCompositeComponent` maintains an auxiliary life cycle state in
 * `this._compositeLifeCycleState` (which can be null).
 *
 * This is different from the life cycle state maintained by `ReactComponent` in
 * `this._lifeCycleState`. The following diagram shows how the states overlap in
 * time. There are times when the CompositeLifeCycle is null - at those times it
 * is only meaningful to look at ComponentLifeCycle alone.
 *
 * Top Row: ReactComponent.ComponentLifeCycle
 * Low Row: ReactComponent.CompositeLifeCycle
 *
 * +-------+------------------------------------------------------+--------+
 * |  UN   |                    MOUNTED                           |   UN   |
 * |MOUNTED|                                                      | MOUNTED|
 * +-------+------------------------------------------------------+--------+
 * |       ^--------+   +------+   +------+   +------+   +--------^        |
 * |       |        |   |      |   |      |   |      |   |        |        |
 * |    0--|MOUNTING|-0-|RECEIV|-0-|RECEIV|-0-|RECEIV|-0-|   UN   |--->0   |
 * |       |        |   |PROPS |   | PROPS|   | STATE|   |MOUNTING|        |
 * |       |        |   |      |   |      |   |      |   |        |        |
 * |       |        |   |      |   |      |   |      |   |        |        |
 * |       +--------+   +------+   +------+   +------+   +--------+        |
 * |       |                                                      |        |
 * +-------+------------------------------------------------------+--------+
 */
var CompositeLifeCycle = keyMirror({
  /**
   * Components in the process of being mounted respond to state changes
   * differently.
   */
  MOUNTING: null,
  /**
   * Components in the process of being unmounted are guarded against state
   * changes.
   */
  UNMOUNTING: null,
  /**
   * Components that are mounted and receiving new props respond to state
   * changes differently.
   */
  RECEIVING_PROPS: null,
  /**
   * Components that are mounted and receiving new state are guarded against
   * additional state changes.
   */
  RECEIVING_STATE: null
});

/**
 * @lends {ReactCompositeComponent.prototype}
 */
var ReactCompositeComponentMixin = {

  /**
   * Base constructor for all composite component.
   *
   * @param {ReactDescriptor} descriptor
   * @final
   * @internal
   */
  construct: function(descriptor) {
    // Children can be either an array or more than one argument
    ReactComponent.Mixin.construct.apply(this, arguments);
    ReactOwner.Mixin.construct.apply(this, arguments);

    this.state = null;
    this._pendingState = null;

    // This is the public post-processed context. The real context and pending
    // context lives on the descriptor.
    this.context = null;

    this._compositeLifeCycleState = null;
  },

  /**
   * Checks whether or not this composite component is mounted.
   * @return {boolean} True if mounted, false otherwise.
   * @protected
   * @final
   */
  isMounted: function() {
    return ReactComponent.Mixin.isMounted.call(this) &&
      this._compositeLifeCycleState !== CompositeLifeCycle.MOUNTING;
  },

  /**
   * Initializes the component, renders markup, and registers event listeners.
   *
   * @param {string} rootID DOM ID of the root node.
   * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
   * @param {number} mountDepth number of components in the owner hierarchy
   * @return {?string} Rendered markup to be inserted into the DOM.
   * @final
   * @internal
   */
  mountComponent: ReactPerf.measure(
    'ReactCompositeComponent',
    'mountComponent',
    function(rootID, transaction, mountDepth) {
      ReactComponent.Mixin.mountComponent.call(
        this,
        rootID,
        transaction,
        mountDepth
      );
      this._compositeLifeCycleState = CompositeLifeCycle.MOUNTING;

      if (this.__reactAutoBindMap) {
        this._bindAutoBindMethods();
      }

      this.context = this._processContext(this._descriptor._context);
      this.props = this._processProps(this.props);

      this.state = this.getInitialState ? this.getInitialState() : null;
      ("production" !== "development" ? invariant(
        typeof this.state === 'object' && !Array.isArray(this.state),
        '%s.getInitialState(): must return an object or null',
        this.constructor.displayName || 'ReactCompositeComponent'
      ) : invariant(typeof this.state === 'object' && !Array.isArray(this.state)));

      this._pendingState = null;
      this._pendingForceUpdate = false;

      if (this.componentWillMount) {
        this.componentWillMount();
        // When mounting, calls to `setState` by `componentWillMount` will set
        // `this._pendingState` without triggering a re-render.
        if (this._pendingState) {
          this.state = this._pendingState;
          this._pendingState = null;
        }
      }

      this._renderedComponent = instantiateReactComponent(
        this._renderValidatedComponent()
      );

      // Done with mounting, `setState` will now trigger UI changes.
      this._compositeLifeCycleState = null;
      var markup = this._renderedComponent.mountComponent(
        rootID,
        transaction,
        mountDepth + 1
      );
      if (this.componentDidMount) {
        transaction.getReactMountReady().enqueue(this.componentDidMount, this);
      }
      return markup;
    }
  ),

  /**
   * Releases any resources allocated by `mountComponent`.
   *
   * @final
   * @internal
   */
  unmountComponent: function() {
    this._compositeLifeCycleState = CompositeLifeCycle.UNMOUNTING;
    if (this.componentWillUnmount) {
      this.componentWillUnmount();
    }
    this._compositeLifeCycleState = null;

    this._renderedComponent.unmountComponent();
    this._renderedComponent = null;

    ReactComponent.Mixin.unmountComponent.call(this);

    // Some existing components rely on this.props even after they've been
    // destroyed (in event handlers).
    // TODO: this.props = null;
    // TODO: this.state = null;
  },

  /**
   * Sets a subset of the state. Always use this or `replaceState` to mutate
   * state. You should treat `this.state` as immutable.
   *
   * There is no guarantee that `this.state` will be immediately updated, so
   * accessing `this.state` after calling this method may return the old value.
   *
   * There is no guarantee that calls to `setState` will run synchronously,
   * as they may eventually be batched together.  You can provide an optional
   * callback that will be executed when the call to setState is actually
   * completed.
   *
   * @param {object} partialState Next partial state to be merged with state.
   * @param {?function} callback Called after state is updated.
   * @final
   * @protected
   */
  setState: function(partialState, callback) {
    ("production" !== "development" ? invariant(
      typeof partialState === 'object' || partialState == null,
      'setState(...): takes an object of state variables to update.'
    ) : invariant(typeof partialState === 'object' || partialState == null));
    if ("production" !== "development"){
      ("production" !== "development" ? warning(
        partialState != null,
        'setState(...): You passed an undefined or null state object; ' +
        'instead, use forceUpdate().'
      ) : null);
    }
    // Merge with `_pendingState` if it exists, otherwise with existing state.
    this.replaceState(
      merge(this._pendingState || this.state, partialState),
      callback
    );
  },

  /**
   * Replaces all of the state. Always use this or `setState` to mutate state.
   * You should treat `this.state` as immutable.
   *
   * There is no guarantee that `this.state` will be immediately updated, so
   * accessing `this.state` after calling this method may return the old value.
   *
   * @param {object} completeState Next state.
   * @param {?function} callback Called after state is updated.
   * @final
   * @protected
   */
  replaceState: function(completeState, callback) {
    validateLifeCycleOnReplaceState(this);
    this._pendingState = completeState;
    if (this._compositeLifeCycleState !== CompositeLifeCycle.MOUNTING) {
      // If we're in a componentWillMount handler, don't enqueue a rerender
      // because ReactUpdates assumes we're in a browser context (which is wrong
      // for server rendering) and we're about to do a render anyway.
      // TODO: The callback here is ignored when setState is called from
      // componentWillMount. Either fix it or disallow doing so completely in
      // favor of getInitialState.
      ReactUpdates.enqueueUpdate(this, callback);
    }
  },

  /**
   * Filters the context object to only contain keys specified in
   * `contextTypes`, and asserts that they are valid.
   *
   * @param {object} context
   * @return {?object}
   * @private
   */
  _processContext: function(context) {
    var maskedContext = null;
    var contextTypes = this.constructor.contextTypes;
    if (contextTypes) {
      maskedContext = {};
      for (var contextName in contextTypes) {
        maskedContext[contextName] = context[contextName];
      }
      if ("production" !== "development") {
        this._checkPropTypes(
          contextTypes,
          maskedContext,
          ReactPropTypeLocations.context
        );
      }
    }
    return maskedContext;
  },

  /**
   * @param {object} currentContext
   * @return {object}
   * @private
   */
  _processChildContext: function(currentContext) {
    var childContext = this.getChildContext && this.getChildContext();
    var displayName = this.constructor.displayName || 'ReactCompositeComponent';
    if (childContext) {
      ("production" !== "development" ? invariant(
        typeof this.constructor.childContextTypes === 'object',
        '%s.getChildContext(): childContextTypes must be defined in order to ' +
        'use getChildContext().',
        displayName
      ) : invariant(typeof this.constructor.childContextTypes === 'object'));
      if ("production" !== "development") {
        this._checkPropTypes(
          this.constructor.childContextTypes,
          childContext,
          ReactPropTypeLocations.childContext
        );
      }
      for (var name in childContext) {
        ("production" !== "development" ? invariant(
          name in this.constructor.childContextTypes,
          '%s.getChildContext(): key "%s" is not defined in childContextTypes.',
          displayName,
          name
        ) : invariant(name in this.constructor.childContextTypes));
      }
      return merge(currentContext, childContext);
    }
    return currentContext;
  },

  /**
   * Processes props by setting default values for unspecified props and
   * asserting that the props are valid. Does not mutate its argument; returns
   * a new props object with defaults merged in.
   *
   * @param {object} newProps
   * @return {object}
   * @private
   */
  _processProps: function(newProps) {
    var defaultProps = this.constructor.defaultProps;
    var props;
    if (defaultProps) {
      props = merge(newProps);
      for (var propName in defaultProps) {
        if (typeof props[propName] === 'undefined') {
          props[propName] = defaultProps[propName];
        }
      }
    } else {
      props = newProps;
    }
    if ("production" !== "development") {
      var propTypes = this.constructor.propTypes;
      if (propTypes) {
        this._checkPropTypes(propTypes, props, ReactPropTypeLocations.prop);
      }
    }
    return props;
  },

  /**
   * Assert that the props are valid
   *
   * @param {object} propTypes Map of prop name to a ReactPropType
   * @param {object} props
   * @param {string} location e.g. "prop", "context", "child context"
   * @private
   */
  _checkPropTypes: function(propTypes, props, location) {
    // TODO: Stop validating prop types here and only use the descriptor
    // validation.
    var componentName = this.constructor.displayName;
    for (var propName in propTypes) {
      if (propTypes.hasOwnProperty(propName)) {
        var error =
          propTypes[propName](props, propName, componentName, location);
        if (error instanceof Error) {
          // We may want to extend this logic for similar errors in
          // renderComponent calls, so I'm abstracting it away into
          // a function to minimize refactoring in the future
          var addendum = getDeclarationErrorAddendum(this);
          ("production" !== "development" ? warning(false, error.message + addendum) : null);
        }
      }
    }
  },

  /**
   * If any of `_pendingDescriptor`, `_pendingState`, or `_pendingForceUpdate`
   * is set, update the component.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  performUpdateIfNecessary: function(transaction) {
    var compositeLifeCycleState = this._compositeLifeCycleState;
    // Do not trigger a state transition if we are in the middle of mounting or
    // receiving props because both of those will already be doing this.
    if (compositeLifeCycleState === CompositeLifeCycle.MOUNTING ||
        compositeLifeCycleState === CompositeLifeCycle.RECEIVING_PROPS) {
      return;
    }

    if (this._pendingDescriptor == null &&
        this._pendingState == null &&
        !this._pendingForceUpdate) {
      return;
    }

    var nextContext = this.context;
    var nextProps = this.props;
    var nextDescriptor = this._descriptor;
    if (this._pendingDescriptor != null) {
      nextDescriptor = this._pendingDescriptor;
      nextContext = this._processContext(nextDescriptor._context);
      nextProps = this._processProps(nextDescriptor.props);
      this._pendingDescriptor = null;

      this._compositeLifeCycleState = CompositeLifeCycle.RECEIVING_PROPS;
      if (this.componentWillReceiveProps) {
        this.componentWillReceiveProps(nextProps, nextContext);
      }
    }

    this._compositeLifeCycleState = CompositeLifeCycle.RECEIVING_STATE;

    var nextState = this._pendingState || this.state;
    this._pendingState = null;

    try {
      var shouldUpdate =
        this._pendingForceUpdate ||
        !this.shouldComponentUpdate ||
        this.shouldComponentUpdate(nextProps, nextState, nextContext);

      if ("production" !== "development") {
        if (typeof shouldUpdate === "undefined") {
          console.warn(
            (this.constructor.displayName || 'ReactCompositeComponent') +
            '.shouldComponentUpdate(): Returned undefined instead of a ' +
            'boolean value. Make sure to return true or false.'
          );
        }
      }

      if (shouldUpdate) {
        this._pendingForceUpdate = false;
        // Will set `this.props`, `this.state` and `this.context`.
        this._performComponentUpdate(
          nextDescriptor,
          nextProps,
          nextState,
          nextContext,
          transaction
        );
      } else {
        // If it's determined that a component should not update, we still want
        // to set props and state.
        this._descriptor = nextDescriptor;
        this.props = nextProps;
        this.state = nextState;
        this.context = nextContext;

        // Owner cannot change because shouldUpdateReactComponent doesn't allow
        // it. TODO: Remove this._owner completely.
        this._owner = nextDescriptor._owner;
      }
    } finally {
      this._compositeLifeCycleState = null;
    }
  },

  /**
   * Merges new props and state, notifies delegate methods of update and
   * performs update.
   *
   * @param {ReactDescriptor} nextDescriptor Next descriptor
   * @param {object} nextProps Next public object to set as properties.
   * @param {?object} nextState Next object to set as state.
   * @param {?object} nextContext Next public object to set as context.
   * @param {ReactReconcileTransaction} transaction
   * @private
   */
  _performComponentUpdate: function(
    nextDescriptor,
    nextProps,
    nextState,
    nextContext,
    transaction
  ) {
    var prevDescriptor = this._descriptor;
    var prevProps = this.props;
    var prevState = this.state;
    var prevContext = this.context;

    if (this.componentWillUpdate) {
      this.componentWillUpdate(nextProps, nextState, nextContext);
    }

    this._descriptor = nextDescriptor;
    this.props = nextProps;
    this.state = nextState;
    this.context = nextContext;

    // Owner cannot change because shouldUpdateReactComponent doesn't allow
    // it. TODO: Remove this._owner completely.
    this._owner = nextDescriptor._owner;

    this.updateComponent(
      transaction,
      prevDescriptor
    );

    if (this.componentDidUpdate) {
      transaction.getReactMountReady().enqueue(
        this.componentDidUpdate.bind(this, prevProps, prevState, prevContext),
        this
      );
    }
  },

  receiveComponent: function(nextDescriptor, transaction) {
    if (nextDescriptor === this._descriptor &&
        nextDescriptor._owner != null) {
      // Since descriptors are immutable after the owner is rendered,
      // we can do a cheap identity compare here to determine if this is a
      // superfluous reconcile. It's possible for state to be mutable but such
      // change should trigger an update of the owner which would recreate
      // the descriptor. We explicitly check for the existence of an owner since
      // it's possible for a descriptor created outside a composite to be
      // deeply mutated and reused.
      return;
    }

    ReactComponent.Mixin.receiveComponent.call(
      this,
      nextDescriptor,
      transaction
    );
  },

  /**
   * Updates the component's currently mounted DOM representation.
   *
   * By default, this implements React's rendering and reconciliation algorithm.
   * Sophisticated clients may wish to override this.
   *
   * @param {ReactReconcileTransaction} transaction
   * @param {ReactDescriptor} prevDescriptor
   * @internal
   * @overridable
   */
  updateComponent: ReactPerf.measure(
    'ReactCompositeComponent',
    'updateComponent',
    function(transaction, prevParentDescriptor) {
      ReactComponent.Mixin.updateComponent.call(
        this,
        transaction,
        prevParentDescriptor
      );

      var prevComponentInstance = this._renderedComponent;
      var prevDescriptor = prevComponentInstance._descriptor;
      var nextDescriptor = this._renderValidatedComponent();
      if (shouldUpdateReactComponent(prevDescriptor, nextDescriptor)) {
        prevComponentInstance.receiveComponent(nextDescriptor, transaction);
      } else {
        // These two IDs are actually the same! But nothing should rely on that.
        var thisID = this._rootNodeID;
        var prevComponentID = prevComponentInstance._rootNodeID;
        prevComponentInstance.unmountComponent();
        this._renderedComponent = instantiateReactComponent(nextDescriptor);
        var nextMarkup = this._renderedComponent.mountComponent(
          thisID,
          transaction,
          this._mountDepth + 1
        );
        ReactComponent.BackendIDOperations.dangerouslyReplaceNodeWithMarkupByID(
          prevComponentID,
          nextMarkup
        );
      }
    }
  ),

  /**
   * Forces an update. This should only be invoked when it is known with
   * certainty that we are **not** in a DOM transaction.
   *
   * You may want to call this when you know that some deeper aspect of the
   * component's state has changed but `setState` was not called.
   *
   * This will not invoke `shouldUpdateComponent`, but it will invoke
   * `componentWillUpdate` and `componentDidUpdate`.
   *
   * @param {?function} callback Called after update is complete.
   * @final
   * @protected
   */
  forceUpdate: function(callback) {
    var compositeLifeCycleState = this._compositeLifeCycleState;
    ("production" !== "development" ? invariant(
      this.isMounted() ||
        compositeLifeCycleState === CompositeLifeCycle.MOUNTING,
      'forceUpdate(...): Can only force an update on mounted or mounting ' +
        'components.'
    ) : invariant(this.isMounted() ||
      compositeLifeCycleState === CompositeLifeCycle.MOUNTING));
    ("production" !== "development" ? invariant(
      compositeLifeCycleState !== CompositeLifeCycle.RECEIVING_STATE &&
      compositeLifeCycleState !== CompositeLifeCycle.UNMOUNTING,
      'forceUpdate(...): Cannot force an update while unmounting component ' +
      'or during an existing state transition (such as within `render`).'
    ) : invariant(compositeLifeCycleState !== CompositeLifeCycle.RECEIVING_STATE &&
    compositeLifeCycleState !== CompositeLifeCycle.UNMOUNTING));
    this._pendingForceUpdate = true;
    ReactUpdates.enqueueUpdate(this, callback);
  },

  /**
   * @private
   */
  _renderValidatedComponent: ReactPerf.measure(
    'ReactCompositeComponent',
    '_renderValidatedComponent',
    function() {
      var renderedComponent;
      var previousContext = ReactContext.current;
      ReactContext.current = this._processChildContext(
        this._descriptor._context
      );
      ReactCurrentOwner.current = this;
      try {
        renderedComponent = this.render();
        if (renderedComponent === null || renderedComponent === false) {
          renderedComponent = ReactEmptyComponent.getEmptyComponent();
          ReactEmptyComponent.registerNullComponentID(this._rootNodeID);
        } else {
          ReactEmptyComponent.deregisterNullComponentID(this._rootNodeID);
        }
      } finally {
        ReactContext.current = previousContext;
        ReactCurrentOwner.current = null;
      }
      ("production" !== "development" ? invariant(
        ReactDescriptor.isValidDescriptor(renderedComponent),
        '%s.render(): A valid ReactComponent must be returned. You may have ' +
          'returned undefined, an array or some other invalid object.',
        this.constructor.displayName || 'ReactCompositeComponent'
      ) : invariant(ReactDescriptor.isValidDescriptor(renderedComponent)));
      return renderedComponent;
    }
  ),

  /**
   * @private
   */
  _bindAutoBindMethods: function() {
    for (var autoBindKey in this.__reactAutoBindMap) {
      if (!this.__reactAutoBindMap.hasOwnProperty(autoBindKey)) {
        continue;
      }
      var method = this.__reactAutoBindMap[autoBindKey];
      this[autoBindKey] = this._bindAutoBindMethod(ReactErrorUtils.guard(
        method,
        this.constructor.displayName + '.' + autoBindKey
      ));
    }
  },

  /**
   * Binds a method to the component.
   *
   * @param {function} method Method to be bound.
   * @private
   */
  _bindAutoBindMethod: function(method) {
    var component = this;
    var boundMethod = function() {
      return method.apply(component, arguments);
    };
    if ("production" !== "development") {
      boundMethod.__reactBoundContext = component;
      boundMethod.__reactBoundMethod = method;
      boundMethod.__reactBoundArguments = null;
      var componentName = component.constructor.displayName;
      var _bind = boundMethod.bind;
      boundMethod.bind = function(newThis ) {var args=Array.prototype.slice.call(arguments,1);
        // User is trying to bind() an autobound method; we effectively will
        // ignore the value of "this" that the user is trying to use, so
        // let's warn.
        if (newThis !== component && newThis !== null) {
          monitorCodeUse('react_bind_warning', { component: componentName });
          console.warn(
            'bind(): React component methods may only be bound to the ' +
            'component instance. See ' + componentName
          );
        } else if (!args.length) {
          monitorCodeUse('react_bind_warning', { component: componentName });
          console.warn(
            'bind(): You are binding a component method to the component. ' +
            'React does this for you automatically in a high-performance ' +
            'way, so you can safely remove this call. See ' + componentName
          );
          return boundMethod;
        }
        var reboundMethod = _bind.apply(boundMethod, arguments);
        reboundMethod.__reactBoundContext = component;
        reboundMethod.__reactBoundMethod = method;
        reboundMethod.__reactBoundArguments = args;
        return reboundMethod;
      };
    }
    return boundMethod;
  }
};

var ReactCompositeComponentBase = function() {};
mixInto(ReactCompositeComponentBase, ReactComponent.Mixin);
mixInto(ReactCompositeComponentBase, ReactOwner.Mixin);
mixInto(ReactCompositeComponentBase, ReactPropTransferer.Mixin);
mixInto(ReactCompositeComponentBase, ReactCompositeComponentMixin);

/**
 * Module for creating composite components.
 *
 * @class ReactCompositeComponent
 * @extends ReactComponent
 * @extends ReactOwner
 * @extends ReactPropTransferer
 */
var ReactCompositeComponent = {

  LifeCycle: CompositeLifeCycle,

  Base: ReactCompositeComponentBase,

  /**
   * Creates a composite component class given a class specification.
   *
   * @param {object} spec Class specification (which must define `render`).
   * @return {function} Component constructor function.
   * @public
   */
  createClass: function(spec) {
    var Constructor = function(props, owner) {
      this.construct(props, owner);
    };
    Constructor.prototype = new ReactCompositeComponentBase();
    Constructor.prototype.constructor = Constructor;

    injectedMixins.forEach(
      mixSpecIntoComponent.bind(null, Constructor)
    );

    mixSpecIntoComponent(Constructor, spec);

    // Initialize the defaultProps property after all mixins have been merged
    if (Constructor.getDefaultProps) {
      Constructor.defaultProps = Constructor.getDefaultProps();
    }

    ("production" !== "development" ? invariant(
      Constructor.prototype.render,
      'createClass(...): Class specification must implement a `render` method.'
    ) : invariant(Constructor.prototype.render));

    if ("production" !== "development") {
      if (Constructor.prototype.componentShouldUpdate) {
        monitorCodeUse(
          'react_component_should_update_warning',
          { component: spec.displayName }
        );
        console.warn(
          (spec.displayName || 'A component') + ' has a method called ' +
          'componentShouldUpdate(). Did you mean shouldComponentUpdate()? ' +
          'The name is phrased as a question because the function is ' +
          'expected to return a value.'
         );
      }
    }

    // Reduce time spent doing lookups by setting these on the prototype.
    for (var methodName in ReactCompositeComponentInterface) {
      if (!Constructor.prototype[methodName]) {
        Constructor.prototype[methodName] = null;
      }
    }

    var descriptorFactory = ReactDescriptor.createFactory(Constructor);

    if ("production" !== "development") {
      return ReactDescriptorValidator.createFactory(
        descriptorFactory,
        Constructor.propTypes,
        Constructor.contextTypes
      );
    }

    return descriptorFactory;
  },

  injection: {
    injectMixin: function(mixin) {
      injectedMixins.push(mixin);
    }
  }
};

module.exports = ReactCompositeComponent;

},{"./ReactComponent":31,"./ReactContext":34,"./ReactCurrentOwner":35,"./ReactDescriptor":51,"./ReactDescriptorValidator":52,"./ReactEmptyComponent":53,"./ReactErrorUtils":54,"./ReactOwner":64,"./ReactPerf":65,"./ReactPropTransferer":66,"./ReactPropTypeLocationNames":67,"./ReactPropTypeLocations":68,"./ReactUpdates":76,"./instantiateReactComponent":119,"./invariant":120,"./keyMirror":126,"./mapObject":128,"./merge":130,"./mixInto":133,"./monitorCodeUse":134,"./shouldUpdateReactComponent":140,"./warning":143}],34:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactContext
 */

"use strict";

var merge = _dereq_("./merge");

/**
 * Keeps track of the current context.
 *
 * The context is automatically passed down the component ownership hierarchy
 * and is accessible via `this.context` on ReactCompositeComponents.
 */
var ReactContext = {

  /**
   * @internal
   * @type {object}
   */
  current: {},

  /**
   * Temporarily extends the current context while executing scopedCallback.
   *
   * A typical use case might look like
   *
   *  render: function() {
   *    var children = ReactContext.withContext({foo: 'foo'} () => (
   *
   *    ));
   *    return <div>{children}</div>;
   *  }
   *
   * @param {object} newContext New context to merge into the existing context
   * @param {function} scopedCallback Callback to run with the new context
   * @return {ReactComponent|array<ReactComponent>}
   */
  withContext: function(newContext, scopedCallback) {
    var result;
    var previousContext = ReactContext.current;
    ReactContext.current = merge(previousContext, newContext);
    try {
      result = scopedCallback();
    } finally {
      ReactContext.current = previousContext;
    }
    return result;
  }

};

module.exports = ReactContext;

},{"./merge":130}],35:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactCurrentOwner
 */

"use strict";

/**
 * Keeps track of the current owner.
 *
 * The current owner is the component who should own any components that are
 * currently being constructed.
 *
 * The depth indicate how many composite components are above this render level.
 */
var ReactCurrentOwner = {

  /**
   * @internal
   * @type {ReactComponent}
   */
  current: null

};

module.exports = ReactCurrentOwner;

},{}],36:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOM
 * @typechecks static-only
 */

"use strict";

var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactDescriptorValidator = _dereq_("./ReactDescriptorValidator");
var ReactDOMComponent = _dereq_("./ReactDOMComponent");

var mergeInto = _dereq_("./mergeInto");
var mapObject = _dereq_("./mapObject");

/**
 * Creates a new React class that is idempotent and capable of containing other
 * React components. It accepts event listeners and DOM properties that are
 * valid according to `DOMProperty`.
 *
 *  - Event listeners: `onClick`, `onMouseDown`, etc.
 *  - DOM properties: `className`, `name`, `title`, etc.
 *
 * The `style` property functions differently from the DOM API. It accepts an
 * object mapping of style properties to values.
 *
 * @param {boolean} omitClose True if the close tag should be omitted.
 * @param {string} tag Tag name (e.g. `div`).
 * @private
 */
function createDOMComponentClass(omitClose, tag) {
  var Constructor = function(descriptor) {
    this.construct(descriptor);
  };
  Constructor.prototype = new ReactDOMComponent(tag, omitClose);
  Constructor.prototype.constructor = Constructor;
  Constructor.displayName = tag;

  var ConvenienceConstructor = ReactDescriptor.createFactory(Constructor);

  if ("production" !== "development") {
    return ReactDescriptorValidator.createFactory(
      ConvenienceConstructor
    );
  }

  return ConvenienceConstructor;
}

/**
 * Creates a mapping from supported HTML tags to `ReactDOMComponent` classes.
 * This is also accessible via `React.DOM`.
 *
 * @public
 */
var ReactDOM = mapObject({
  a: false,
  abbr: false,
  address: false,
  area: true,
  article: false,
  aside: false,
  audio: false,
  b: false,
  base: true,
  bdi: false,
  bdo: false,
  big: false,
  blockquote: false,
  body: false,
  br: true,
  button: false,
  canvas: false,
  caption: false,
  cite: false,
  code: false,
  col: true,
  colgroup: false,
  data: false,
  datalist: false,
  dd: false,
  del: false,
  details: false,
  dfn: false,
  dialog: false,
  div: false,
  dl: false,
  dt: false,
  em: false,
  embed: true,
  fieldset: false,
  figcaption: false,
  figure: false,
  footer: false,
  form: false, // NOTE: Injected, see `ReactDOMForm`.
  h1: false,
  h2: false,
  h3: false,
  h4: false,
  h5: false,
  h6: false,
  head: false,
  header: false,
  hr: true,
  html: false,
  i: false,
  iframe: false,
  img: true,
  input: true,
  ins: false,
  kbd: false,
  keygen: true,
  label: false,
  legend: false,
  li: false,
  link: true,
  main: false,
  map: false,
  mark: false,
  menu: false,
  menuitem: false, // NOTE: Close tag should be omitted, but causes problems.
  meta: true,
  meter: false,
  nav: false,
  noscript: false,
  object: false,
  ol: false,
  optgroup: false,
  option: false,
  output: false,
  p: false,
  param: true,
  picture: false,
  pre: false,
  progress: false,
  q: false,
  rp: false,
  rt: false,
  ruby: false,
  s: false,
  samp: false,
  script: false,
  section: false,
  select: false,
  small: false,
  source: true,
  span: false,
  strong: false,
  style: false,
  sub: false,
  summary: false,
  sup: false,
  table: false,
  tbody: false,
  td: false,
  textarea: false, // NOTE: Injected, see `ReactDOMTextarea`.
  tfoot: false,
  th: false,
  thead: false,
  time: false,
  title: false,
  tr: false,
  track: true,
  u: false,
  ul: false,
  'var': false,
  video: false,
  wbr: true,

  // SVG
  circle: false,
  defs: false,
  ellipse: false,
  g: false,
  line: false,
  linearGradient: false,
  mask: false,
  path: false,
  pattern: false,
  polygon: false,
  polyline: false,
  radialGradient: false,
  rect: false,
  stop: false,
  svg: false,
  text: false,
  tspan: false
}, createDOMComponentClass);

var injection = {
  injectComponentClasses: function(componentClasses) {
    mergeInto(ReactDOM, componentClasses);
  }
};

ReactDOM.injection = injection;

module.exports = ReactDOM;

},{"./ReactDOMComponent":38,"./ReactDescriptor":51,"./ReactDescriptorValidator":52,"./mapObject":128,"./mergeInto":132}],37:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMButton
 */

"use strict";

var AutoFocusMixin = _dereq_("./AutoFocusMixin");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");

var keyMirror = _dereq_("./keyMirror");

// Store a reference to the <button> `ReactDOMComponent`.
var button = ReactDOM.button;

var mouseListenerNames = keyMirror({
  onClick: true,
  onDoubleClick: true,
  onMouseDown: true,
  onMouseMove: true,
  onMouseUp: true,
  onClickCapture: true,
  onDoubleClickCapture: true,
  onMouseDownCapture: true,
  onMouseMoveCapture: true,
  onMouseUpCapture: true
});

/**
 * Implements a <button> native component that does not receive mouse events
 * when `disabled` is set.
 */
var ReactDOMButton = ReactCompositeComponent.createClass({
  displayName: 'ReactDOMButton',

  mixins: [AutoFocusMixin, ReactBrowserComponentMixin],

  render: function() {
    var props = {};

    // Copy the props; except the mouse listeners if we're disabled
    for (var key in this.props) {
      if (this.props.hasOwnProperty(key) &&
          (!this.props.disabled || !mouseListenerNames[key])) {
        props[key] = this.props[key];
      }
    }

    return button(props, this.props.children);
  }

});

module.exports = ReactDOMButton;

},{"./AutoFocusMixin":1,"./ReactBrowserComponentMixin":28,"./ReactCompositeComponent":33,"./ReactDOM":36,"./keyMirror":126}],38:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMComponent
 * @typechecks static-only
 */

"use strict";

var CSSPropertyOperations = _dereq_("./CSSPropertyOperations");
var DOMProperty = _dereq_("./DOMProperty");
var DOMPropertyOperations = _dereq_("./DOMPropertyOperations");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactComponent = _dereq_("./ReactComponent");
var ReactBrowserEventEmitter = _dereq_("./ReactBrowserEventEmitter");
var ReactMount = _dereq_("./ReactMount");
var ReactMultiChild = _dereq_("./ReactMultiChild");
var ReactPerf = _dereq_("./ReactPerf");

var escapeTextForBrowser = _dereq_("./escapeTextForBrowser");
var invariant = _dereq_("./invariant");
var keyOf = _dereq_("./keyOf");
var merge = _dereq_("./merge");
var mixInto = _dereq_("./mixInto");

var deleteListener = ReactBrowserEventEmitter.deleteListener;
var listenTo = ReactBrowserEventEmitter.listenTo;
var registrationNameModules = ReactBrowserEventEmitter.registrationNameModules;

// For quickly matching children type, to test if can be treated as content.
var CONTENT_TYPES = {'string': true, 'number': true};

var STYLE = keyOf({style: null});

var ELEMENT_NODE_TYPE = 1;

/**
 * @param {?object} props
 */
function assertValidProps(props) {
  if (!props) {
    return;
  }
  // Note the use of `==` which checks for null or undefined.
  ("production" !== "development" ? invariant(
    props.children == null || props.dangerouslySetInnerHTML == null,
    'Can only set one of `children` or `props.dangerouslySetInnerHTML`.'
  ) : invariant(props.children == null || props.dangerouslySetInnerHTML == null));
  ("production" !== "development" ? invariant(
    props.style == null || typeof props.style === 'object',
    'The `style` prop expects a mapping from style properties to values, ' +
    'not a string.'
  ) : invariant(props.style == null || typeof props.style === 'object'));
}

function putListener(id, registrationName, listener, transaction) {
  var container = ReactMount.findReactContainerForID(id);
  if (container) {
    var doc = container.nodeType === ELEMENT_NODE_TYPE ?
      container.ownerDocument :
      container;
    listenTo(registrationName, doc);
  }
  transaction.getPutListenerQueue().enqueuePutListener(
    id,
    registrationName,
    listener
  );
}


/**
 * @constructor ReactDOMComponent
 * @extends ReactComponent
 * @extends ReactMultiChild
 */
function ReactDOMComponent(tag, omitClose) {
  this._tagOpen = '<' + tag;
  this._tagClose = omitClose ? '' : '</' + tag + '>';
  this.tagName = tag.toUpperCase();
}

ReactDOMComponent.Mixin = {

  /**
   * Generates root tag markup then recurses. This method has side effects and
   * is not idempotent.
   *
   * @internal
   * @param {string} rootID The root DOM ID for this node.
   * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
   * @param {number} mountDepth number of components in the owner hierarchy
   * @return {string} The computed markup.
   */
  mountComponent: ReactPerf.measure(
    'ReactDOMComponent',
    'mountComponent',
    function(rootID, transaction, mountDepth) {
      ReactComponent.Mixin.mountComponent.call(
        this,
        rootID,
        transaction,
        mountDepth
      );
      assertValidProps(this.props);
      return (
        this._createOpenTagMarkupAndPutListeners(transaction) +
        this._createContentMarkup(transaction) +
        this._tagClose
      );
    }
  ),

  /**
   * Creates markup for the open tag and all attributes.
   *
   * This method has side effects because events get registered.
   *
   * Iterating over object properties is faster than iterating over arrays.
   * @see http://jsperf.com/obj-vs-arr-iteration
   *
   * @private
   * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
   * @return {string} Markup of opening tag.
   */
  _createOpenTagMarkupAndPutListeners: function(transaction) {
    var props = this.props;
    var ret = this._tagOpen;

    for (var propKey in props) {
      if (!props.hasOwnProperty(propKey)) {
        continue;
      }
      var propValue = props[propKey];
      if (propValue == null) {
        continue;
      }
      if (registrationNameModules.hasOwnProperty(propKey)) {
        putListener(this._rootNodeID, propKey, propValue, transaction);
      } else {
        if (propKey === STYLE) {
          if (propValue) {
            propValue = props.style = merge(props.style);
          }
          propValue = CSSPropertyOperations.createMarkupForStyles(propValue);
        }
        var markup =
          DOMPropertyOperations.createMarkupForProperty(propKey, propValue);
        if (markup) {
          ret += ' ' + markup;
        }
      }
    }

    // For static pages, no need to put React ID and checksum. Saves lots of
    // bytes.
    if (transaction.renderToStaticMarkup) {
      return ret + '>';
    }

    var markupForID = DOMPropertyOperations.createMarkupForID(this._rootNodeID);
    return ret + ' ' + markupForID + '>';
  },

  /**
   * Creates markup for the content between the tags.
   *
   * @private
   * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
   * @return {string} Content markup.
   */
  _createContentMarkup: function(transaction) {
    // Intentional use of != to avoid catching zero/false.
    var innerHTML = this.props.dangerouslySetInnerHTML;
    if (innerHTML != null) {
      if (innerHTML.__html != null) {
        return innerHTML.__html;
      }
    } else {
      var contentToUse =
        CONTENT_TYPES[typeof this.props.children] ? this.props.children : null;
      var childrenToUse = contentToUse != null ? null : this.props.children;
      if (contentToUse != null) {
        return escapeTextForBrowser(contentToUse);
      } else if (childrenToUse != null) {
        var mountImages = this.mountChildren(
          childrenToUse,
          transaction
        );
        return mountImages.join('');
      }
    }
    return '';
  },

  receiveComponent: function(nextDescriptor, transaction) {
    if (nextDescriptor === this._descriptor &&
        nextDescriptor._owner != null) {
      // Since descriptors are immutable after the owner is rendered,
      // we can do a cheap identity compare here to determine if this is a
      // superfluous reconcile. It's possible for state to be mutable but such
      // change should trigger an update of the owner which would recreate
      // the descriptor. We explicitly check for the existence of an owner since
      // it's possible for a descriptor created outside a composite to be
      // deeply mutated and reused.
      return;
    }

    ReactComponent.Mixin.receiveComponent.call(
      this,
      nextDescriptor,
      transaction
    );
  },

  /**
   * Updates a native DOM component after it has already been allocated and
   * attached to the DOM. Reconciles the root DOM node, then recurses.
   *
   * @param {ReactReconcileTransaction} transaction
   * @param {ReactDescriptor} prevDescriptor
   * @internal
   * @overridable
   */
  updateComponent: ReactPerf.measure(
    'ReactDOMComponent',
    'updateComponent',
    function(transaction, prevDescriptor) {
      assertValidProps(this._descriptor.props);
      ReactComponent.Mixin.updateComponent.call(
        this,
        transaction,
        prevDescriptor
      );
      this._updateDOMProperties(prevDescriptor.props, transaction);
      this._updateDOMChildren(prevDescriptor.props, transaction);
    }
  ),

  /**
   * Reconciles the properties by detecting differences in property values and
   * updating the DOM as necessary. This function is probably the single most
   * critical path for performance optimization.
   *
   * TODO: Benchmark whether checking for changed values in memory actually
   *       improves performance (especially statically positioned elements).
   * TODO: Benchmark the effects of putting this at the top since 99% of props
   *       do not change for a given reconciliation.
   * TODO: Benchmark areas that can be improved with caching.
   *
   * @private
   * @param {object} lastProps
   * @param {ReactReconcileTransaction} transaction
   */
  _updateDOMProperties: function(lastProps, transaction) {
    var nextProps = this.props;
    var propKey;
    var styleName;
    var styleUpdates;
    for (propKey in lastProps) {
      if (nextProps.hasOwnProperty(propKey) ||
         !lastProps.hasOwnProperty(propKey)) {
        continue;
      }
      if (propKey === STYLE) {
        var lastStyle = lastProps[propKey];
        for (styleName in lastStyle) {
          if (lastStyle.hasOwnProperty(styleName)) {
            styleUpdates = styleUpdates || {};
            styleUpdates[styleName] = '';
          }
        }
      } else if (registrationNameModules.hasOwnProperty(propKey)) {
        deleteListener(this._rootNodeID, propKey);
      } else if (
          DOMProperty.isStandardName[propKey] ||
          DOMProperty.isCustomAttribute(propKey)) {
        ReactComponent.BackendIDOperations.deletePropertyByID(
          this._rootNodeID,
          propKey
        );
      }
    }
    for (propKey in nextProps) {
      var nextProp = nextProps[propKey];
      var lastProp = lastProps[propKey];
      if (!nextProps.hasOwnProperty(propKey) || nextProp === lastProp) {
        continue;
      }
      if (propKey === STYLE) {
        if (nextProp) {
          nextProp = nextProps.style = merge(nextProp);
        }
        if (lastProp) {
          // Unset styles on `lastProp` but not on `nextProp`.
          for (styleName in lastProp) {
            if (lastProp.hasOwnProperty(styleName) &&
                (!nextProp || !nextProp.hasOwnProperty(styleName))) {
              styleUpdates = styleUpdates || {};
              styleUpdates[styleName] = '';
            }
          }
          // Update styles that changed since `lastProp`.
          for (styleName in nextProp) {
            if (nextProp.hasOwnProperty(styleName) &&
                lastProp[styleName] !== nextProp[styleName]) {
              styleUpdates = styleUpdates || {};
              styleUpdates[styleName] = nextProp[styleName];
            }
          }
        } else {
          // Relies on `updateStylesByID` not mutating `styleUpdates`.
          styleUpdates = nextProp;
        }
      } else if (registrationNameModules.hasOwnProperty(propKey)) {
        putListener(this._rootNodeID, propKey, nextProp, transaction);
      } else if (
          DOMProperty.isStandardName[propKey] ||
          DOMProperty.isCustomAttribute(propKey)) {
        ReactComponent.BackendIDOperations.updatePropertyByID(
          this._rootNodeID,
          propKey,
          nextProp
        );
      }
    }
    if (styleUpdates) {
      ReactComponent.BackendIDOperations.updateStylesByID(
        this._rootNodeID,
        styleUpdates
      );
    }
  },

  /**
   * Reconciles the children with the various properties that affect the
   * children content.
   *
   * @param {object} lastProps
   * @param {ReactReconcileTransaction} transaction
   */
  _updateDOMChildren: function(lastProps, transaction) {
    var nextProps = this.props;

    var lastContent =
      CONTENT_TYPES[typeof lastProps.children] ? lastProps.children : null;
    var nextContent =
      CONTENT_TYPES[typeof nextProps.children] ? nextProps.children : null;

    var lastHtml =
      lastProps.dangerouslySetInnerHTML &&
      lastProps.dangerouslySetInnerHTML.__html;
    var nextHtml =
      nextProps.dangerouslySetInnerHTML &&
      nextProps.dangerouslySetInnerHTML.__html;

    // Note the use of `!=` which checks for null or undefined.
    var lastChildren = lastContent != null ? null : lastProps.children;
    var nextChildren = nextContent != null ? null : nextProps.children;

    // If we're switching from children to content/html or vice versa, remove
    // the old content
    var lastHasContentOrHtml = lastContent != null || lastHtml != null;
    var nextHasContentOrHtml = nextContent != null || nextHtml != null;
    if (lastChildren != null && nextChildren == null) {
      this.updateChildren(null, transaction);
    } else if (lastHasContentOrHtml && !nextHasContentOrHtml) {
      this.updateTextContent('');
    }

    if (nextContent != null) {
      if (lastContent !== nextContent) {
        this.updateTextContent('' + nextContent);
      }
    } else if (nextHtml != null) {
      if (lastHtml !== nextHtml) {
        ReactComponent.BackendIDOperations.updateInnerHTMLByID(
          this._rootNodeID,
          nextHtml
        );
      }
    } else if (nextChildren != null) {
      this.updateChildren(nextChildren, transaction);
    }
  },

  /**
   * Destroys all event registrations for this instance. Does not remove from
   * the DOM. That must be done by the parent.
   *
   * @internal
   */
  unmountComponent: function() {
    this.unmountChildren();
    ReactBrowserEventEmitter.deleteAllListeners(this._rootNodeID);
    ReactComponent.Mixin.unmountComponent.call(this);
  }

};

mixInto(ReactDOMComponent, ReactComponent.Mixin);
mixInto(ReactDOMComponent, ReactDOMComponent.Mixin);
mixInto(ReactDOMComponent, ReactMultiChild.Mixin);
mixInto(ReactDOMComponent, ReactBrowserComponentMixin);

module.exports = ReactDOMComponent;

},{"./CSSPropertyOperations":4,"./DOMProperty":10,"./DOMPropertyOperations":11,"./ReactBrowserComponentMixin":28,"./ReactBrowserEventEmitter":29,"./ReactComponent":31,"./ReactMount":61,"./ReactMultiChild":62,"./ReactPerf":65,"./escapeTextForBrowser":104,"./invariant":120,"./keyOf":127,"./merge":130,"./mixInto":133}],39:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMForm
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var LocalEventTrapMixin = _dereq_("./LocalEventTrapMixin");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");

// Store a reference to the <form> `ReactDOMComponent`.
var form = ReactDOM.form;

/**
 * Since onSubmit doesn't bubble OR capture on the top level in IE8, we need
 * to capture it on the <form> element itself. There are lots of hacks we could
 * do to accomplish this, but the most reliable is to make <form> a
 * composite component and use `componentDidMount` to attach the event handlers.
 */
var ReactDOMForm = ReactCompositeComponent.createClass({
  displayName: 'ReactDOMForm',

  mixins: [ReactBrowserComponentMixin, LocalEventTrapMixin],

  render: function() {
    // TODO: Instead of using `ReactDOM` directly, we should use JSX. However,
    // `jshint` fails to parse JSX so in order for linting to work in the open
    // source repo, we need to just use `ReactDOM.form`.
    return this.transferPropsTo(form(null, this.props.children));
  },

  componentDidMount: function() {
    this.trapBubbledEvent(EventConstants.topLevelTypes.topReset, 'reset');
    this.trapBubbledEvent(EventConstants.topLevelTypes.topSubmit, 'submit');
  }
});

module.exports = ReactDOMForm;

},{"./EventConstants":15,"./LocalEventTrapMixin":24,"./ReactBrowserComponentMixin":28,"./ReactCompositeComponent":33,"./ReactDOM":36}],40:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMIDOperations
 * @typechecks static-only
 */

/*jslint evil: true */

"use strict";

var CSSPropertyOperations = _dereq_("./CSSPropertyOperations");
var DOMChildrenOperations = _dereq_("./DOMChildrenOperations");
var DOMPropertyOperations = _dereq_("./DOMPropertyOperations");
var ReactMount = _dereq_("./ReactMount");
var ReactPerf = _dereq_("./ReactPerf");

var invariant = _dereq_("./invariant");
var setInnerHTML = _dereq_("./setInnerHTML");

/**
 * Errors for properties that should not be updated with `updatePropertyById()`.
 *
 * @type {object}
 * @private
 */
var INVALID_PROPERTY_ERRORS = {
  dangerouslySetInnerHTML:
    '`dangerouslySetInnerHTML` must be set using `updateInnerHTMLByID()`.',
  style: '`style` must be set using `updateStylesByID()`.'
};

/**
 * Operations used to process updates to DOM nodes. This is made injectable via
 * `ReactComponent.BackendIDOperations`.
 */
var ReactDOMIDOperations = {

  /**
   * Updates a DOM node with new property values. This should only be used to
   * update DOM properties in `DOMProperty`.
   *
   * @param {string} id ID of the node to update.
   * @param {string} name A valid property name, see `DOMProperty`.
   * @param {*} value New value of the property.
   * @internal
   */
  updatePropertyByID: ReactPerf.measure(
    'ReactDOMIDOperations',
    'updatePropertyByID',
    function(id, name, value) {
      var node = ReactMount.getNode(id);
      ("production" !== "development" ? invariant(
        !INVALID_PROPERTY_ERRORS.hasOwnProperty(name),
        'updatePropertyByID(...): %s',
        INVALID_PROPERTY_ERRORS[name]
      ) : invariant(!INVALID_PROPERTY_ERRORS.hasOwnProperty(name)));

      // If we're updating to null or undefined, we should remove the property
      // from the DOM node instead of inadvertantly setting to a string. This
      // brings us in line with the same behavior we have on initial render.
      if (value != null) {
        DOMPropertyOperations.setValueForProperty(node, name, value);
      } else {
        DOMPropertyOperations.deleteValueForProperty(node, name);
      }
    }
  ),

  /**
   * Updates a DOM node to remove a property. This should only be used to remove
   * DOM properties in `DOMProperty`.
   *
   * @param {string} id ID of the node to update.
   * @param {string} name A property name to remove, see `DOMProperty`.
   * @internal
   */
  deletePropertyByID: ReactPerf.measure(
    'ReactDOMIDOperations',
    'deletePropertyByID',
    function(id, name, value) {
      var node = ReactMount.getNode(id);
      ("production" !== "development" ? invariant(
        !INVALID_PROPERTY_ERRORS.hasOwnProperty(name),
        'updatePropertyByID(...): %s',
        INVALID_PROPERTY_ERRORS[name]
      ) : invariant(!INVALID_PROPERTY_ERRORS.hasOwnProperty(name)));
      DOMPropertyOperations.deleteValueForProperty(node, name, value);
    }
  ),

  /**
   * Updates a DOM node with new style values. If a value is specified as '',
   * the corresponding style property will be unset.
   *
   * @param {string} id ID of the node to update.
   * @param {object} styles Mapping from styles to values.
   * @internal
   */
  updateStylesByID: ReactPerf.measure(
    'ReactDOMIDOperations',
    'updateStylesByID',
    function(id, styles) {
      var node = ReactMount.getNode(id);
      CSSPropertyOperations.setValueForStyles(node, styles);
    }
  ),

  /**
   * Updates a DOM node's innerHTML.
   *
   * @param {string} id ID of the node to update.
   * @param {string} html An HTML string.
   * @internal
   */
  updateInnerHTMLByID: ReactPerf.measure(
    'ReactDOMIDOperations',
    'updateInnerHTMLByID',
    function(id, html) {
      var node = ReactMount.getNode(id);
      setInnerHTML(node, html);
    }
  ),

  /**
   * Updates a DOM node's text content set by `props.content`.
   *
   * @param {string} id ID of the node to update.
   * @param {string} content Text content.
   * @internal
   */
  updateTextContentByID: ReactPerf.measure(
    'ReactDOMIDOperations',
    'updateTextContentByID',
    function(id, content) {
      var node = ReactMount.getNode(id);
      DOMChildrenOperations.updateTextContent(node, content);
    }
  ),

  /**
   * Replaces a DOM node that exists in the document with markup.
   *
   * @param {string} id ID of child to be replaced.
   * @param {string} markup Dangerous markup to inject in place of child.
   * @internal
   * @see {Danger.dangerouslyReplaceNodeWithMarkup}
   */
  dangerouslyReplaceNodeWithMarkupByID: ReactPerf.measure(
    'ReactDOMIDOperations',
    'dangerouslyReplaceNodeWithMarkupByID',
    function(id, markup) {
      var node = ReactMount.getNode(id);
      DOMChildrenOperations.dangerouslyReplaceNodeWithMarkup(node, markup);
    }
  ),

  /**
   * Updates a component's children by processing a series of updates.
   *
   * @param {array<object>} updates List of update configurations.
   * @param {array<string>} markup List of markup strings.
   * @internal
   */
  dangerouslyProcessChildrenUpdates: ReactPerf.measure(
    'ReactDOMIDOperations',
    'dangerouslyProcessChildrenUpdates',
    function(updates, markup) {
      for (var i = 0; i < updates.length; i++) {
        updates[i].parentNode = ReactMount.getNode(updates[i].parentID);
      }
      DOMChildrenOperations.processUpdates(updates, markup);
    }
  )
};

module.exports = ReactDOMIDOperations;

},{"./CSSPropertyOperations":4,"./DOMChildrenOperations":9,"./DOMPropertyOperations":11,"./ReactMount":61,"./ReactPerf":65,"./invariant":120,"./setInnerHTML":138}],41:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMImg
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var LocalEventTrapMixin = _dereq_("./LocalEventTrapMixin");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");

// Store a reference to the <img> `ReactDOMComponent`.
var img = ReactDOM.img;

/**
 * Since onLoad doesn't bubble OR capture on the top level in IE8, we need to
 * capture it on the <img> element itself. There are lots of hacks we could do
 * to accomplish this, but the most reliable is to make <img> a composite
 * component and use `componentDidMount` to attach the event handlers.
 */
var ReactDOMImg = ReactCompositeComponent.createClass({
  displayName: 'ReactDOMImg',
  tagName: 'IMG',

  mixins: [ReactBrowserComponentMixin, LocalEventTrapMixin],

  render: function() {
    return img(this.props);
  },

  componentDidMount: function() {
    this.trapBubbledEvent(EventConstants.topLevelTypes.topLoad, 'load');
    this.trapBubbledEvent(EventConstants.topLevelTypes.topError, 'error');
  }
});

module.exports = ReactDOMImg;

},{"./EventConstants":15,"./LocalEventTrapMixin":24,"./ReactBrowserComponentMixin":28,"./ReactCompositeComponent":33,"./ReactDOM":36}],42:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMInput
 */

"use strict";

var AutoFocusMixin = _dereq_("./AutoFocusMixin");
var DOMPropertyOperations = _dereq_("./DOMPropertyOperations");
var LinkedValueUtils = _dereq_("./LinkedValueUtils");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");
var ReactMount = _dereq_("./ReactMount");

var invariant = _dereq_("./invariant");
var merge = _dereq_("./merge");

// Store a reference to the <input> `ReactDOMComponent`.
var input = ReactDOM.input;

var instancesByReactID = {};

/**
 * Implements an <input> native component that allows setting these optional
 * props: `checked`, `value`, `defaultChecked`, and `defaultValue`.
 *
 * If `checked` or `value` are not supplied (or null/undefined), user actions
 * that affect the checked state or value will trigger updates to the element.
 *
 * If they are supplied (and not null/undefined), the rendered element will not
 * trigger updates to the element. Instead, the props must change in order for
 * the rendered element to be updated.
 *
 * The rendered element will be initialized as unchecked (or `defaultChecked`)
 * with an empty value (or `defaultValue`).
 *
 * @see http://www.w3.org/TR/2012/WD-html5-20121025/the-input-element.html
 */
var ReactDOMInput = ReactCompositeComponent.createClass({
  displayName: 'ReactDOMInput',

  mixins: [AutoFocusMixin, LinkedValueUtils.Mixin, ReactBrowserComponentMixin],

  getInitialState: function() {
    var defaultValue = this.props.defaultValue;
    return {
      checked: this.props.defaultChecked || false,
      value: defaultValue != null ? defaultValue : null
    };
  },

  shouldComponentUpdate: function() {
    // Defer any updates to this component during the `onChange` handler.
    return !this._isChanging;
  },

  render: function() {
    // Clone `this.props` so we don't mutate the input.
    var props = merge(this.props);

    props.defaultChecked = null;
    props.defaultValue = null;

    var value = LinkedValueUtils.getValue(this);
    props.value = value != null ? value : this.state.value;

    var checked = LinkedValueUtils.getChecked(this);
    props.checked = checked != null ? checked : this.state.checked;

    props.onChange = this._handleChange;

    return input(props, this.props.children);
  },

  componentDidMount: function() {
    var id = ReactMount.getID(this.getDOMNode());
    instancesByReactID[id] = this;
  },

  componentWillUnmount: function() {
    var rootNode = this.getDOMNode();
    var id = ReactMount.getID(rootNode);
    delete instancesByReactID[id];
  },

  componentDidUpdate: function(prevProps, prevState, prevContext) {
    var rootNode = this.getDOMNode();
    if (this.props.checked != null) {
      DOMPropertyOperations.setValueForProperty(
        rootNode,
        'checked',
        this.props.checked || false
      );
    }

    var value = LinkedValueUtils.getValue(this);
    if (value != null) {
      // Cast `value` to a string to ensure the value is set correctly. While
      // browsers typically do this as necessary, jsdom doesn't.
      DOMPropertyOperations.setValueForProperty(rootNode, 'value', '' + value);
    }
  },

  _handleChange: function(event) {
    var returnValue;
    var onChange = LinkedValueUtils.getOnChange(this);
    if (onChange) {
      this._isChanging = true;
      returnValue = onChange.call(this, event);
      this._isChanging = false;
    }
    this.setState({
      checked: event.target.checked,
      value: event.target.value
    });

    var name = this.props.name;
    if (this.props.type === 'radio' && name != null) {
      var rootNode = this.getDOMNode();
      var queryRoot = rootNode;

      while (queryRoot.parentNode) {
        queryRoot = queryRoot.parentNode;
      }

      // If `rootNode.form` was non-null, then we could try `form.elements`,
      // but that sometimes behaves strangely in IE8. We could also try using
      // `form.getElementsByName`, but that will only return direct children
      // and won't include inputs that use the HTML5 `form=` attribute. Since
      // the input might not even be in a form, let's just use the global
      // `querySelectorAll` to ensure we don't miss anything.
      var group = queryRoot.querySelectorAll(
        'input[name=' + JSON.stringify('' + name) + '][type="radio"]');

      for (var i = 0, groupLen = group.length; i < groupLen; i++) {
        var otherNode = group[i];
        if (otherNode === rootNode ||
            otherNode.form !== rootNode.form) {
          continue;
        }
        var otherID = ReactMount.getID(otherNode);
        ("production" !== "development" ? invariant(
          otherID,
          'ReactDOMInput: Mixing React and non-React radio inputs with the ' +
          'same `name` is not supported.'
        ) : invariant(otherID));
        var otherInstance = instancesByReactID[otherID];
        ("production" !== "development" ? invariant(
          otherInstance,
          'ReactDOMInput: Unknown radio button ID %s.',
          otherID
        ) : invariant(otherInstance));
        // In some cases, this will actually change the `checked` state value.
        // In other cases, there's no change but this forces a reconcile upon
        // which componentDidUpdate will reset the DOM property to whatever it
        // should be.
        otherInstance.setState({
          checked: false
        });
      }
    }

    return returnValue;
  }

});

module.exports = ReactDOMInput;

},{"./AutoFocusMixin":1,"./DOMPropertyOperations":11,"./LinkedValueUtils":23,"./ReactBrowserComponentMixin":28,"./ReactCompositeComponent":33,"./ReactDOM":36,"./ReactMount":61,"./invariant":120,"./merge":130}],43:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMOption
 */

"use strict";

var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");

var warning = _dereq_("./warning");

// Store a reference to the <option> `ReactDOMComponent`.
var option = ReactDOM.option;

/**
 * Implements an <option> native component that warns when `selected` is set.
 */
var ReactDOMOption = ReactCompositeComponent.createClass({
  displayName: 'ReactDOMOption',

  mixins: [ReactBrowserComponentMixin],

  componentWillMount: function() {
    // TODO (yungsters): Remove support for `selected` in <option>.
    if ("production" !== "development") {
      ("production" !== "development" ? warning(
        this.props.selected == null,
        'Use the `defaultValue` or `value` props on <select> instead of ' +
        'setting `selected` on <option>.'
      ) : null);
    }
  },

  render: function() {
    return option(this.props, this.props.children);
  }

});

module.exports = ReactDOMOption;

},{"./ReactBrowserComponentMixin":28,"./ReactCompositeComponent":33,"./ReactDOM":36,"./warning":143}],44:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMSelect
 */

"use strict";

var AutoFocusMixin = _dereq_("./AutoFocusMixin");
var LinkedValueUtils = _dereq_("./LinkedValueUtils");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");

var merge = _dereq_("./merge");

// Store a reference to the <select> `ReactDOMComponent`.
var select = ReactDOM.select;

/**
 * Validation function for `value` and `defaultValue`.
 * @private
 */
function selectValueType(props, propName, componentName) {
  if (props[propName] == null) {
    return;
  }
  if (props.multiple) {
    if (!Array.isArray(props[propName])) {
      return new Error(
        ("The `" + propName + "` prop supplied to <select> must be an array if ") +
        ("`multiple` is true.")
      );
    }
  } else {
    if (Array.isArray(props[propName])) {
      return new Error(
        ("The `" + propName + "` prop supplied to <select> must be a scalar ") +
        ("value if `multiple` is false.")
      );
    }
  }
}

/**
 * If `value` is supplied, updates <option> elements on mount and update.
 * @param {ReactComponent} component Instance of ReactDOMSelect
 * @param {?*} propValue For uncontrolled components, null/undefined. For
 * controlled components, a string (or with `multiple`, a list of strings).
 * @private
 */
function updateOptions(component, propValue) {
  var multiple = component.props.multiple;
  var value = propValue != null ? propValue : component.state.value;
  var options = component.getDOMNode().options;
  var selectedValue, i, l;
  if (multiple) {
    selectedValue = {};
    for (i = 0, l = value.length; i < l; ++i) {
      selectedValue['' + value[i]] = true;
    }
  } else {
    selectedValue = '' + value;
  }
  for (i = 0, l = options.length; i < l; i++) {
    var selected = multiple ?
      selectedValue.hasOwnProperty(options[i].value) :
      options[i].value === selectedValue;

    if (selected !== options[i].selected) {
      options[i].selected = selected;
    }
  }
}

/**
 * Implements a <select> native component that allows optionally setting the
 * props `value` and `defaultValue`. If `multiple` is false, the prop must be a
 * string. If `multiple` is true, the prop must be an array of strings.
 *
 * If `value` is not supplied (or null/undefined), user actions that change the
 * selected option will trigger updates to the rendered options.
 *
 * If it is supplied (and not null/undefined), the rendered options will not
 * update in response to user actions. Instead, the `value` prop must change in
 * order for the rendered options to update.
 *
 * If `defaultValue` is provided, any options with the supplied values will be
 * selected.
 */
var ReactDOMSelect = ReactCompositeComponent.createClass({
  displayName: 'ReactDOMSelect',

  mixins: [AutoFocusMixin, LinkedValueUtils.Mixin, ReactBrowserComponentMixin],

  propTypes: {
    defaultValue: selectValueType,
    value: selectValueType
  },

  getInitialState: function() {
    return {value: this.props.defaultValue || (this.props.multiple ? [] : '')};
  },

  componentWillReceiveProps: function(nextProps) {
    if (!this.props.multiple && nextProps.multiple) {
      this.setState({value: [this.state.value]});
    } else if (this.props.multiple && !nextProps.multiple) {
      this.setState({value: this.state.value[0]});
    }
  },

  shouldComponentUpdate: function() {
    // Defer any updates to this component during the `onChange` handler.
    return !this._isChanging;
  },

  render: function() {
    // Clone `this.props` so we don't mutate the input.
    var props = merge(this.props);

    props.onChange = this._handleChange;
    props.value = null;

    return select(props, this.props.children);
  },

  componentDidMount: function() {
    updateOptions(this, LinkedValueUtils.getValue(this));
  },

  componentDidUpdate: function(prevProps) {
    var value = LinkedValueUtils.getValue(this);
    var prevMultiple = !!prevProps.multiple;
    var multiple = !!this.props.multiple;
    if (value != null || prevMultiple !== multiple) {
      updateOptions(this, value);
    }
  },

  _handleChange: function(event) {
    var returnValue;
    var onChange = LinkedValueUtils.getOnChange(this);
    if (onChange) {
      this._isChanging = true;
      returnValue = onChange.call(this, event);
      this._isChanging = false;
    }

    var selectedValue;
    if (this.props.multiple) {
      selectedValue = [];
      var options = event.target.options;
      for (var i = 0, l = options.length; i < l; i++) {
        if (options[i].selected) {
          selectedValue.push(options[i].value);
        }
      }
    } else {
      selectedValue = event.target.value;
    }

    this.setState({value: selectedValue});
    return returnValue;
  }

});

module.exports = ReactDOMSelect;

},{"./AutoFocusMixin":1,"./LinkedValueUtils":23,"./ReactBrowserComponentMixin":28,"./ReactCompositeComponent":33,"./ReactDOM":36,"./merge":130}],45:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMSelection
 */

"use strict";

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var getNodeForCharacterOffset = _dereq_("./getNodeForCharacterOffset");
var getTextContentAccessor = _dereq_("./getTextContentAccessor");

/**
 * While `isCollapsed` is available on the Selection object and `collapsed`
 * is available on the Range object, IE11 sometimes gets them wrong.
 * If the anchor/focus nodes and offsets are the same, the range is collapsed.
 */
function isCollapsed(anchorNode, anchorOffset, focusNode, focusOffset) {
  return anchorNode === focusNode && anchorOffset === focusOffset;
}

/**
 * Get the appropriate anchor and focus node/offset pairs for IE.
 *
 * The catch here is that IE's selection API doesn't provide information
 * about whether the selection is forward or backward, so we have to
 * behave as though it's always forward.
 *
 * IE text differs from modern selection in that it behaves as though
 * block elements end with a new line. This means character offsets will
 * differ between the two APIs.
 *
 * @param {DOMElement} node
 * @return {object}
 */
function getIEOffsets(node) {
  var selection = document.selection;
  var selectedRange = selection.createRange();
  var selectedLength = selectedRange.text.length;

  // Duplicate selection so we can move range without breaking user selection.
  var fromStart = selectedRange.duplicate();
  fromStart.moveToElementText(node);
  fromStart.setEndPoint('EndToStart', selectedRange);

  var startOffset = fromStart.text.length;
  var endOffset = startOffset + selectedLength;

  return {
    start: startOffset,
    end: endOffset
  };
}

/**
 * @param {DOMElement} node
 * @return {?object}
 */
function getModernOffsets(node) {
  var selection = window.getSelection();

  if (selection.rangeCount === 0) {
    return null;
  }

  var anchorNode = selection.anchorNode;
  var anchorOffset = selection.anchorOffset;
  var focusNode = selection.focusNode;
  var focusOffset = selection.focusOffset;

  var currentRange = selection.getRangeAt(0);

  // If the node and offset values are the same, the selection is collapsed.
  // `Selection.isCollapsed` is available natively, but IE sometimes gets
  // this value wrong.
  var isSelectionCollapsed = isCollapsed(
    selection.anchorNode,
    selection.anchorOffset,
    selection.focusNode,
    selection.focusOffset
  );

  var rangeLength = isSelectionCollapsed ? 0 : currentRange.toString().length;

  var tempRange = currentRange.cloneRange();
  tempRange.selectNodeContents(node);
  tempRange.setEnd(currentRange.startContainer, currentRange.startOffset);

  var isTempRangeCollapsed = isCollapsed(
    tempRange.startContainer,
    tempRange.startOffset,
    tempRange.endContainer,
    tempRange.endOffset
  );

  var start = isTempRangeCollapsed ? 0 : tempRange.toString().length;
  var end = start + rangeLength;

  // Detect whether the selection is backward.
  var detectionRange = document.createRange();
  detectionRange.setStart(anchorNode, anchorOffset);
  detectionRange.setEnd(focusNode, focusOffset);
  var isBackward = detectionRange.collapsed;
  detectionRange.detach();

  return {
    start: isBackward ? end : start,
    end: isBackward ? start : end
  };
}

/**
 * @param {DOMElement|DOMTextNode} node
 * @param {object} offsets
 */
function setIEOffsets(node, offsets) {
  var range = document.selection.createRange().duplicate();
  var start, end;

  if (typeof offsets.end === 'undefined') {
    start = offsets.start;
    end = start;
  } else if (offsets.start > offsets.end) {
    start = offsets.end;
    end = offsets.start;
  } else {
    start = offsets.start;
    end = offsets.end;
  }

  range.moveToElementText(node);
  range.moveStart('character', start);
  range.setEndPoint('EndToStart', range);
  range.moveEnd('character', end - start);
  range.select();
}

/**
 * In modern non-IE browsers, we can support both forward and backward
 * selections.
 *
 * Note: IE10+ supports the Selection object, but it does not support
 * the `extend` method, which means that even in modern IE, it's not possible
 * to programatically create a backward selection. Thus, for all IE
 * versions, we use the old IE API to create our selections.
 *
 * @param {DOMElement|DOMTextNode} node
 * @param {object} offsets
 */
function setModernOffsets(node, offsets) {
  var selection = window.getSelection();

  var length = node[getTextContentAccessor()].length;
  var start = Math.min(offsets.start, length);
  var end = typeof offsets.end === 'undefined' ?
            start : Math.min(offsets.end, length);

  // IE 11 uses modern selection, but doesn't support the extend method.
  // Flip backward selections, so we can set with a single range.
  if (!selection.extend && start > end) {
    var temp = end;
    end = start;
    start = temp;
  }

  var startMarker = getNodeForCharacterOffset(node, start);
  var endMarker = getNodeForCharacterOffset(node, end);

  if (startMarker && endMarker) {
    var range = document.createRange();
    range.setStart(startMarker.node, startMarker.offset);
    selection.removeAllRanges();

    if (start > end) {
      selection.addRange(range);
      selection.extend(endMarker.node, endMarker.offset);
    } else {
      range.setEnd(endMarker.node, endMarker.offset);
      selection.addRange(range);
    }

    range.detach();
  }
}

var useIEOffsets = ExecutionEnvironment.canUseDOM && document.selection;

var ReactDOMSelection = {
  /**
   * @param {DOMElement} node
   */
  getOffsets: useIEOffsets ? getIEOffsets : getModernOffsets,

  /**
   * @param {DOMElement|DOMTextNode} node
   * @param {object} offsets
   */
  setOffsets: useIEOffsets ? setIEOffsets : setModernOffsets
};

module.exports = ReactDOMSelection;

},{"./ExecutionEnvironment":21,"./getNodeForCharacterOffset":113,"./getTextContentAccessor":115}],46:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDOMTextarea
 */

"use strict";

var AutoFocusMixin = _dereq_("./AutoFocusMixin");
var DOMPropertyOperations = _dereq_("./DOMPropertyOperations");
var LinkedValueUtils = _dereq_("./LinkedValueUtils");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");

var invariant = _dereq_("./invariant");
var merge = _dereq_("./merge");

var warning = _dereq_("./warning");

// Store a reference to the <textarea> `ReactDOMComponent`.
var textarea = ReactDOM.textarea;

/**
 * Implements a <textarea> native component that allows setting `value`, and
 * `defaultValue`. This differs from the traditional DOM API because value is
 * usually set as PCDATA children.
 *
 * If `value` is not supplied (or null/undefined), user actions that affect the
 * value will trigger updates to the element.
 *
 * If `value` is supplied (and not null/undefined), the rendered element will
 * not trigger updates to the element. Instead, the `value` prop must change in
 * order for the rendered element to be updated.
 *
 * The rendered element will be initialized with an empty value, the prop
 * `defaultValue` if specified, or the children content (deprecated).
 */
var ReactDOMTextarea = ReactCompositeComponent.createClass({
  displayName: 'ReactDOMTextarea',

  mixins: [AutoFocusMixin, LinkedValueUtils.Mixin, ReactBrowserComponentMixin],

  getInitialState: function() {
    var defaultValue = this.props.defaultValue;
    // TODO (yungsters): Remove support for children content in <textarea>.
    var children = this.props.children;
    if (children != null) {
      if ("production" !== "development") {
        ("production" !== "development" ? warning(
          false,
          'Use the `defaultValue` or `value` props instead of setting ' +
          'children on <textarea>.'
        ) : null);
      }
      ("production" !== "development" ? invariant(
        defaultValue == null,
        'If you supply `defaultValue` on a <textarea>, do not pass children.'
      ) : invariant(defaultValue == null));
      if (Array.isArray(children)) {
        ("production" !== "development" ? invariant(
          children.length <= 1,
          '<textarea> can only have at most one child.'
        ) : invariant(children.length <= 1));
        children = children[0];
      }

      defaultValue = '' + children;
    }
    if (defaultValue == null) {
      defaultValue = '';
    }
    var value = LinkedValueUtils.getValue(this);
    return {
      // We save the initial value so that `ReactDOMComponent` doesn't update
      // `textContent` (unnecessary since we update value).
      // The initial value can be a boolean or object so that's why it's
      // forced to be a string.
      initialValue: '' + (value != null ? value : defaultValue)
    };
  },

  shouldComponentUpdate: function() {
    // Defer any updates to this component during the `onChange` handler.
    return !this._isChanging;
  },

  render: function() {
    // Clone `this.props` so we don't mutate the input.
    var props = merge(this.props);

    ("production" !== "development" ? invariant(
      props.dangerouslySetInnerHTML == null,
      '`dangerouslySetInnerHTML` does not make sense on <textarea>.'
    ) : invariant(props.dangerouslySetInnerHTML == null));

    props.defaultValue = null;
    props.value = null;
    props.onChange = this._handleChange;

    // Always set children to the same thing. In IE9, the selection range will
    // get reset if `textContent` is mutated.
    return textarea(props, this.state.initialValue);
  },

  componentDidUpdate: function(prevProps, prevState, prevContext) {
    var value = LinkedValueUtils.getValue(this);
    if (value != null) {
      var rootNode = this.getDOMNode();
      // Cast `value` to a string to ensure the value is set correctly. While
      // browsers typically do this as necessary, jsdom doesn't.
      DOMPropertyOperations.setValueForProperty(rootNode, 'value', '' + value);
    }
  },

  _handleChange: function(event) {
    var returnValue;
    var onChange = LinkedValueUtils.getOnChange(this);
    if (onChange) {
      this._isChanging = true;
      returnValue = onChange.call(this, event);
      this._isChanging = false;
    }
    this.setState({value: event.target.value});
    return returnValue;
  }

});

module.exports = ReactDOMTextarea;

},{"./AutoFocusMixin":1,"./DOMPropertyOperations":11,"./LinkedValueUtils":23,"./ReactBrowserComponentMixin":28,"./ReactCompositeComponent":33,"./ReactDOM":36,"./invariant":120,"./merge":130,"./warning":143}],47:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDefaultBatchingStrategy
 */

"use strict";

var ReactUpdates = _dereq_("./ReactUpdates");
var Transaction = _dereq_("./Transaction");

var emptyFunction = _dereq_("./emptyFunction");
var mixInto = _dereq_("./mixInto");

var RESET_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: function() {
    ReactDefaultBatchingStrategy.isBatchingUpdates = false;
  }
};

var FLUSH_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: ReactUpdates.flushBatchedUpdates.bind(ReactUpdates)
};

var TRANSACTION_WRAPPERS = [FLUSH_BATCHED_UPDATES, RESET_BATCHED_UPDATES];

function ReactDefaultBatchingStrategyTransaction() {
  this.reinitializeTransaction();
}

mixInto(ReactDefaultBatchingStrategyTransaction, Transaction.Mixin);
mixInto(ReactDefaultBatchingStrategyTransaction, {
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  }
});

var transaction = new ReactDefaultBatchingStrategyTransaction();

var ReactDefaultBatchingStrategy = {
  isBatchingUpdates: false,

  /**
   * Call the provided function in a context within which calls to `setState`
   * and friends are batched such that components aren't updated unnecessarily.
   */
  batchedUpdates: function(callback, a, b) {
    var alreadyBatchingUpdates = ReactDefaultBatchingStrategy.isBatchingUpdates;

    ReactDefaultBatchingStrategy.isBatchingUpdates = true;

    // The code is written this way to avoid extra allocations
    if (alreadyBatchingUpdates) {
      callback(a, b);
    } else {
      transaction.perform(callback, null, a, b);
    }
  }
};

module.exports = ReactDefaultBatchingStrategy;

},{"./ReactUpdates":76,"./Transaction":92,"./emptyFunction":102,"./mixInto":133}],48:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDefaultInjection
 */

"use strict";

var BeforeInputEventPlugin = _dereq_("./BeforeInputEventPlugin");
var ChangeEventPlugin = _dereq_("./ChangeEventPlugin");
var ClientReactRootIndex = _dereq_("./ClientReactRootIndex");
var CompositionEventPlugin = _dereq_("./CompositionEventPlugin");
var DefaultEventPluginOrder = _dereq_("./DefaultEventPluginOrder");
var EnterLeaveEventPlugin = _dereq_("./EnterLeaveEventPlugin");
var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");
var HTMLDOMPropertyConfig = _dereq_("./HTMLDOMPropertyConfig");
var MobileSafariClickEventPlugin = _dereq_("./MobileSafariClickEventPlugin");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactComponentBrowserEnvironment =
  _dereq_("./ReactComponentBrowserEnvironment");
var ReactDefaultBatchingStrategy = _dereq_("./ReactDefaultBatchingStrategy");
var ReactDOM = _dereq_("./ReactDOM");
var ReactDOMButton = _dereq_("./ReactDOMButton");
var ReactDOMForm = _dereq_("./ReactDOMForm");
var ReactDOMImg = _dereq_("./ReactDOMImg");
var ReactDOMInput = _dereq_("./ReactDOMInput");
var ReactDOMOption = _dereq_("./ReactDOMOption");
var ReactDOMSelect = _dereq_("./ReactDOMSelect");
var ReactDOMTextarea = _dereq_("./ReactDOMTextarea");
var ReactEventListener = _dereq_("./ReactEventListener");
var ReactInjection = _dereq_("./ReactInjection");
var ReactInstanceHandles = _dereq_("./ReactInstanceHandles");
var ReactMount = _dereq_("./ReactMount");
var SelectEventPlugin = _dereq_("./SelectEventPlugin");
var ServerReactRootIndex = _dereq_("./ServerReactRootIndex");
var SimpleEventPlugin = _dereq_("./SimpleEventPlugin");
var SVGDOMPropertyConfig = _dereq_("./SVGDOMPropertyConfig");

var createFullPageComponent = _dereq_("./createFullPageComponent");

function inject() {
  ReactInjection.EventEmitter.injectReactEventListener(
    ReactEventListener
  );

  /**
   * Inject modules for resolving DOM hierarchy and plugin ordering.
   */
  ReactInjection.EventPluginHub.injectEventPluginOrder(DefaultEventPluginOrder);
  ReactInjection.EventPluginHub.injectInstanceHandle(ReactInstanceHandles);
  ReactInjection.EventPluginHub.injectMount(ReactMount);

  /**
   * Some important event plugins included by default (without having to require
   * them).
   */
  ReactInjection.EventPluginHub.injectEventPluginsByName({
    SimpleEventPlugin: SimpleEventPlugin,
    EnterLeaveEventPlugin: EnterLeaveEventPlugin,
    ChangeEventPlugin: ChangeEventPlugin,
    CompositionEventPlugin: CompositionEventPlugin,
    MobileSafariClickEventPlugin: MobileSafariClickEventPlugin,
    SelectEventPlugin: SelectEventPlugin,
    BeforeInputEventPlugin: BeforeInputEventPlugin
  });

  ReactInjection.DOM.injectComponentClasses({
    button: ReactDOMButton,
    form: ReactDOMForm,
    img: ReactDOMImg,
    input: ReactDOMInput,
    option: ReactDOMOption,
    select: ReactDOMSelect,
    textarea: ReactDOMTextarea,

    html: createFullPageComponent(ReactDOM.html),
    head: createFullPageComponent(ReactDOM.head),
    body: createFullPageComponent(ReactDOM.body)
  });

  // This needs to happen after createFullPageComponent() otherwise the mixin
  // gets double injected.
  ReactInjection.CompositeComponent.injectMixin(ReactBrowserComponentMixin);

  ReactInjection.DOMProperty.injectDOMPropertyConfig(HTMLDOMPropertyConfig);
  ReactInjection.DOMProperty.injectDOMPropertyConfig(SVGDOMPropertyConfig);

  ReactInjection.EmptyComponent.injectEmptyComponent(ReactDOM.noscript);

  ReactInjection.Updates.injectReconcileTransaction(
    ReactComponentBrowserEnvironment.ReactReconcileTransaction
  );
  ReactInjection.Updates.injectBatchingStrategy(
    ReactDefaultBatchingStrategy
  );

  ReactInjection.RootIndex.injectCreateReactRootIndex(
    ExecutionEnvironment.canUseDOM ?
      ClientReactRootIndex.createReactRootIndex :
      ServerReactRootIndex.createReactRootIndex
  );

  ReactInjection.Component.injectEnvironment(ReactComponentBrowserEnvironment);

  if ("production" !== "development") {
    var url = (ExecutionEnvironment.canUseDOM && window.location.href) || '';
    if ((/[?&]react_perf\b/).test(url)) {
      var ReactDefaultPerf = _dereq_("./ReactDefaultPerf");
      ReactDefaultPerf.start();
    }
  }
}

module.exports = {
  inject: inject
};

},{"./BeforeInputEventPlugin":2,"./ChangeEventPlugin":6,"./ClientReactRootIndex":7,"./CompositionEventPlugin":8,"./DefaultEventPluginOrder":13,"./EnterLeaveEventPlugin":14,"./ExecutionEnvironment":21,"./HTMLDOMPropertyConfig":22,"./MobileSafariClickEventPlugin":25,"./ReactBrowserComponentMixin":28,"./ReactComponentBrowserEnvironment":32,"./ReactDOM":36,"./ReactDOMButton":37,"./ReactDOMForm":39,"./ReactDOMImg":41,"./ReactDOMInput":42,"./ReactDOMOption":43,"./ReactDOMSelect":44,"./ReactDOMTextarea":46,"./ReactDefaultBatchingStrategy":47,"./ReactDefaultPerf":49,"./ReactEventListener":56,"./ReactInjection":57,"./ReactInstanceHandles":59,"./ReactMount":61,"./SVGDOMPropertyConfig":77,"./SelectEventPlugin":78,"./ServerReactRootIndex":79,"./SimpleEventPlugin":80,"./createFullPageComponent":99}],49:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDefaultPerf
 * @typechecks static-only
 */

"use strict";

var DOMProperty = _dereq_("./DOMProperty");
var ReactDefaultPerfAnalysis = _dereq_("./ReactDefaultPerfAnalysis");
var ReactMount = _dereq_("./ReactMount");
var ReactPerf = _dereq_("./ReactPerf");

var performanceNow = _dereq_("./performanceNow");

function roundFloat(val) {
  return Math.floor(val * 100) / 100;
}

function addValue(obj, key, val) {
  obj[key] = (obj[key] || 0) + val;
}

var ReactDefaultPerf = {
  _allMeasurements: [], // last item in the list is the current one
  _mountStack: [0],
  _injected: false,

  start: function() {
    if (!ReactDefaultPerf._injected) {
      ReactPerf.injection.injectMeasure(ReactDefaultPerf.measure);
    }

    ReactDefaultPerf._allMeasurements.length = 0;
    ReactPerf.enableMeasure = true;
  },

  stop: function() {
    ReactPerf.enableMeasure = false;
  },

  getLastMeasurements: function() {
    return ReactDefaultPerf._allMeasurements;
  },

  printExclusive: function(measurements) {
    measurements = measurements || ReactDefaultPerf._allMeasurements;
    var summary = ReactDefaultPerfAnalysis.getExclusiveSummary(measurements);
    console.table(summary.map(function(item) {
      return {
        'Component class name': item.componentName,
        'Total inclusive time (ms)': roundFloat(item.inclusive),
        'Exclusive mount time (ms)': roundFloat(item.exclusive),
        'Exclusive render time (ms)': roundFloat(item.render),
        'Mount time per instance (ms)': roundFloat(item.exclusive / item.count),
        'Render time per instance (ms)': roundFloat(item.render / item.count),
        'Instances': item.count
      };
    }));
    // TODO: ReactDefaultPerfAnalysis.getTotalTime() does not return the correct
    // number.
  },

  printInclusive: function(measurements) {
    measurements = measurements || ReactDefaultPerf._allMeasurements;
    var summary = ReactDefaultPerfAnalysis.getInclusiveSummary(measurements);
    console.table(summary.map(function(item) {
      return {
        'Owner > component': item.componentName,
        'Inclusive time (ms)': roundFloat(item.time),
        'Instances': item.count
      };
    }));
    console.log(
      'Total time:',
      ReactDefaultPerfAnalysis.getTotalTime(measurements).toFixed(2) + ' ms'
    );
  },

  printWasted: function(measurements) {
    measurements = measurements || ReactDefaultPerf._allMeasurements;
    var summary = ReactDefaultPerfAnalysis.getInclusiveSummary(
      measurements,
      true
    );
    console.table(summary.map(function(item) {
      return {
        'Owner > component': item.componentName,
        'Wasted time (ms)': item.time,
        'Instances': item.count
      };
    }));
    console.log(
      'Total time:',
      ReactDefaultPerfAnalysis.getTotalTime(measurements).toFixed(2) + ' ms'
    );
  },

  printDOM: function(measurements) {
    measurements = measurements || ReactDefaultPerf._allMeasurements;
    var summary = ReactDefaultPerfAnalysis.getDOMSummary(measurements);
    console.table(summary.map(function(item) {
      var result = {};
      result[DOMProperty.ID_ATTRIBUTE_NAME] = item.id;
      result['type'] = item.type;
      result['args'] = JSON.stringify(item.args);
      return result;
    }));
    console.log(
      'Total time:',
      ReactDefaultPerfAnalysis.getTotalTime(measurements).toFixed(2) + ' ms'
    );
  },

  _recordWrite: function(id, fnName, totalTime, args) {
    // TODO: totalTime isn't that useful since it doesn't count paints/reflows
    var writes =
      ReactDefaultPerf
        ._allMeasurements[ReactDefaultPerf._allMeasurements.length - 1]
        .writes;
    writes[id] = writes[id] || [];
    writes[id].push({
      type: fnName,
      time: totalTime,
      args: args
    });
  },

  measure: function(moduleName, fnName, func) {
    return function() {var args=Array.prototype.slice.call(arguments,0);
      var totalTime;
      var rv;
      var start;

      if (fnName === '_renderNewRootComponent' ||
          fnName === 'flushBatchedUpdates') {
        // A "measurement" is a set of metrics recorded for each flush. We want
        // to group the metrics for a given flush together so we can look at the
        // components that rendered and the DOM operations that actually
        // happened to determine the amount of "wasted work" performed.
        ReactDefaultPerf._allMeasurements.push({
          exclusive: {},
          inclusive: {},
          render: {},
          counts: {},
          writes: {},
          displayNames: {},
          totalTime: 0
        });
        start = performanceNow();
        rv = func.apply(this, args);
        ReactDefaultPerf._allMeasurements[
          ReactDefaultPerf._allMeasurements.length - 1
        ].totalTime = performanceNow() - start;
        return rv;
      } else if (moduleName === 'ReactDOMIDOperations' ||
        moduleName === 'ReactComponentBrowserEnvironment') {
        start = performanceNow();
        rv = func.apply(this, args);
        totalTime = performanceNow() - start;

        if (fnName === 'mountImageIntoNode') {
          var mountID = ReactMount.getID(args[1]);
          ReactDefaultPerf._recordWrite(mountID, fnName, totalTime, args[0]);
        } else if (fnName === 'dangerouslyProcessChildrenUpdates') {
          // special format
          args[0].forEach(function(update) {
            var writeArgs = {};
            if (update.fromIndex !== null) {
              writeArgs.fromIndex = update.fromIndex;
            }
            if (update.toIndex !== null) {
              writeArgs.toIndex = update.toIndex;
            }
            if (update.textContent !== null) {
              writeArgs.textContent = update.textContent;
            }
            if (update.markupIndex !== null) {
              writeArgs.markup = args[1][update.markupIndex];
            }
            ReactDefaultPerf._recordWrite(
              update.parentID,
              update.type,
              totalTime,
              writeArgs
            );
          });
        } else {
          // basic format
          ReactDefaultPerf._recordWrite(
            args[0],
            fnName,
            totalTime,
            Array.prototype.slice.call(args, 1)
          );
        }
        return rv;
      } else if (moduleName === 'ReactCompositeComponent' && (
        fnName === 'mountComponent' ||
        fnName === 'updateComponent' || // TODO: receiveComponent()?
        fnName === '_renderValidatedComponent')) {

        var rootNodeID = fnName === 'mountComponent' ?
          args[0] :
          this._rootNodeID;
        var isRender = fnName === '_renderValidatedComponent';
        var isMount = fnName === 'mountComponent';

        var mountStack = ReactDefaultPerf._mountStack;
        var entry = ReactDefaultPerf._allMeasurements[
          ReactDefaultPerf._allMeasurements.length - 1
        ];

        if (isRender) {
          addValue(entry.counts, rootNodeID, 1);
        } else if (isMount) {
          mountStack.push(0);
        }

        start = performanceNow();
        rv = func.apply(this, args);
        totalTime = performanceNow() - start;

        if (isRender) {
          addValue(entry.render, rootNodeID, totalTime);
        } else if (isMount) {
          var subMountTime = mountStack.pop();
          mountStack[mountStack.length - 1] += totalTime;
          addValue(entry.exclusive, rootNodeID, totalTime - subMountTime);
          addValue(entry.inclusive, rootNodeID, totalTime);
        } else {
          addValue(entry.inclusive, rootNodeID, totalTime);
        }

        entry.displayNames[rootNodeID] = {
          current: this.constructor.displayName,
          owner: this._owner ? this._owner.constructor.displayName : '<root>'
        };

        return rv;
      } else {
        return func.apply(this, args);
      }
    };
  }
};

module.exports = ReactDefaultPerf;

},{"./DOMProperty":10,"./ReactDefaultPerfAnalysis":50,"./ReactMount":61,"./ReactPerf":65,"./performanceNow":137}],50:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDefaultPerfAnalysis
 */

var merge = _dereq_("./merge");

// Don't try to save users less than 1.2ms (a number I made up)
var DONT_CARE_THRESHOLD = 1.2;
var DOM_OPERATION_TYPES = {
  'mountImageIntoNode': 'set innerHTML',
  INSERT_MARKUP: 'set innerHTML',
  MOVE_EXISTING: 'move',
  REMOVE_NODE: 'remove',
  TEXT_CONTENT: 'set textContent',
  'updatePropertyByID': 'update attribute',
  'deletePropertyByID': 'delete attribute',
  'updateStylesByID': 'update styles',
  'updateInnerHTMLByID': 'set innerHTML',
  'dangerouslyReplaceNodeWithMarkupByID': 'replace'
};

function getTotalTime(measurements) {
  // TODO: return number of DOM ops? could be misleading.
  // TODO: measure dropped frames after reconcile?
  // TODO: log total time of each reconcile and the top-level component
  // class that triggered it.
  var totalTime = 0;
  for (var i = 0; i < measurements.length; i++) {
    var measurement = measurements[i];
    totalTime += measurement.totalTime;
  }
  return totalTime;
}

function getDOMSummary(measurements) {
  var items = [];
  for (var i = 0; i < measurements.length; i++) {
    var measurement = measurements[i];
    var id;

    for (id in measurement.writes) {
      measurement.writes[id].forEach(function(write) {
        items.push({
          id: id,
          type: DOM_OPERATION_TYPES[write.type] || write.type,
          args: write.args
        });
      });
    }
  }
  return items;
}

function getExclusiveSummary(measurements) {
  var candidates = {};
  var displayName;

  for (var i = 0; i < measurements.length; i++) {
    var measurement = measurements[i];
    var allIDs = merge(measurement.exclusive, measurement.inclusive);

    for (var id in allIDs) {
      displayName = measurement.displayNames[id].current;

      candidates[displayName] = candidates[displayName] || {
        componentName: displayName,
        inclusive: 0,
        exclusive: 0,
        render: 0,
        count: 0
      };
      if (measurement.render[id]) {
        candidates[displayName].render += measurement.render[id];
      }
      if (measurement.exclusive[id]) {
        candidates[displayName].exclusive += measurement.exclusive[id];
      }
      if (measurement.inclusive[id]) {
        candidates[displayName].inclusive += measurement.inclusive[id];
      }
      if (measurement.counts[id]) {
        candidates[displayName].count += measurement.counts[id];
      }
    }
  }

  // Now make a sorted array with the results.
  var arr = [];
  for (displayName in candidates) {
    if (candidates[displayName].exclusive >= DONT_CARE_THRESHOLD) {
      arr.push(candidates[displayName]);
    }
  }

  arr.sort(function(a, b) {
    return b.exclusive - a.exclusive;
  });

  return arr;
}

function getInclusiveSummary(measurements, onlyClean) {
  var candidates = {};
  var inclusiveKey;

  for (var i = 0; i < measurements.length; i++) {
    var measurement = measurements[i];
    var allIDs = merge(measurement.exclusive, measurement.inclusive);
    var cleanComponents;

    if (onlyClean) {
      cleanComponents = getUnchangedComponents(measurement);
    }

    for (var id in allIDs) {
      if (onlyClean && !cleanComponents[id]) {
        continue;
      }

      var displayName = measurement.displayNames[id];

      // Inclusive time is not useful for many components without knowing where
      // they are instantiated. So we aggregate inclusive time with both the
      // owner and current displayName as the key.
      inclusiveKey = displayName.owner + ' > ' + displayName.current;

      candidates[inclusiveKey] = candidates[inclusiveKey] || {
        componentName: inclusiveKey,
        time: 0,
        count: 0
      };

      if (measurement.inclusive[id]) {
        candidates[inclusiveKey].time += measurement.inclusive[id];
      }
      if (measurement.counts[id]) {
        candidates[inclusiveKey].count += measurement.counts[id];
      }
    }
  }

  // Now make a sorted array with the results.
  var arr = [];
  for (inclusiveKey in candidates) {
    if (candidates[inclusiveKey].time >= DONT_CARE_THRESHOLD) {
      arr.push(candidates[inclusiveKey]);
    }
  }

  arr.sort(function(a, b) {
    return b.time - a.time;
  });

  return arr;
}

function getUnchangedComponents(measurement) {
  // For a given reconcile, look at which components did not actually
  // render anything to the DOM and return a mapping of their ID to
  // the amount of time it took to render the entire subtree.
  var cleanComponents = {};
  var dirtyLeafIDs = Object.keys(measurement.writes);
  var allIDs = merge(measurement.exclusive, measurement.inclusive);

  for (var id in allIDs) {
    var isDirty = false;
    // For each component that rendered, see if a component that triggerd
    // a DOM op is in its subtree.
    for (var i = 0; i < dirtyLeafIDs.length; i++) {
      if (dirtyLeafIDs[i].indexOf(id) === 0) {
        isDirty = true;
        break;
      }
    }
    if (!isDirty && measurement.counts[id] > 0) {
      cleanComponents[id] = true;
    }
  }
  return cleanComponents;
}

var ReactDefaultPerfAnalysis = {
  getExclusiveSummary: getExclusiveSummary,
  getInclusiveSummary: getInclusiveSummary,
  getDOMSummary: getDOMSummary,
  getTotalTime: getTotalTime
};

module.exports = ReactDefaultPerfAnalysis;

},{"./merge":130}],51:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDescriptor
 */

"use strict";

var ReactContext = _dereq_("./ReactContext");
var ReactCurrentOwner = _dereq_("./ReactCurrentOwner");

var merge = _dereq_("./merge");
var warning = _dereq_("./warning");

/**
 * Warn for mutations.
 *
 * @internal
 * @param {object} object
 * @param {string} key
 */
function defineWarningProperty(object, key) {
  Object.defineProperty(object, key, {

    configurable: false,
    enumerable: true,

    get: function() {
      if (!this._store) {
        return null;
      }
      return this._store[key];
    },

    set: function(value) {
      ("production" !== "development" ? warning(
        false,
        'Don\'t set the ' + key + ' property of the component. ' +
        'Mutate the existing props object instead.'
      ) : null);
      this._store[key] = value;
    }

  });
}

/**
 * This is updated to true if the membrane is successfully created.
 */
var useMutationMembrane = false;

/**
 * Warn for mutations.
 *
 * @internal
 * @param {object} descriptor
 */
function defineMutationMembrane(prototype) {
  try {
    var pseudoFrozenProperties = {
      props: true
    };
    for (var key in pseudoFrozenProperties) {
      defineWarningProperty(prototype, key);
    }
    useMutationMembrane = true;
  } catch (x) {
    // IE will fail on defineProperty
  }
}

/**
 * Transfer static properties from the source to the target. Functions are
 * rebound to have this reflect the original source.
 */
function proxyStaticMethods(target, source) {
  if (typeof source !== 'function') {
    return;
  }
  for (var key in source) {
    if (source.hasOwnProperty(key)) {
      var value = source[key];
      if (typeof value === 'function') {
        var bound = value.bind(source);
        // Copy any properties defined on the function, such as `isRequired` on
        // a PropTypes validator. (mergeInto refuses to work on functions.)
        for (var k in value) {
          if (value.hasOwnProperty(k)) {
            bound[k] = value[k];
          }
        }
        target[key] = bound;
      } else {
        target[key] = value;
      }
    }
  }
}

/**
 * Base constructor for all React descriptors. This is only used to make this
 * work with a dynamic instanceof check. Nothing should live on this prototype.
 *
 * @param {*} type
 * @internal
 */
var ReactDescriptor = function() {};

if ("production" !== "development") {
  defineMutationMembrane(ReactDescriptor.prototype);
}

ReactDescriptor.createFactory = function(type) {

  var descriptorPrototype = Object.create(ReactDescriptor.prototype);

  var factory = function(props, children) {
    // For consistency we currently allocate a new object for every descriptor.
    // This protects the descriptor from being mutated by the original props
    // object being mutated. It also protects the original props object from
    // being mutated by children arguments and default props. This behavior
    // comes with a performance cost and could be deprecated in the future.
    // It could also be optimized with a smarter JSX transform.
    if (props == null) {
      props = {};
    } else if (typeof props === 'object') {
      props = merge(props);
    }

    // Children can be more than one argument, and those are transferred onto
    // the newly allocated props object.
    var childrenLength = arguments.length - 1;
    if (childrenLength === 1) {
      props.children = children;
    } else if (childrenLength > 1) {
      var childArray = Array(childrenLength);
      for (var i = 0; i < childrenLength; i++) {
        childArray[i] = arguments[i + 1];
      }
      props.children = childArray;
    }

    // Initialize the descriptor object
    var descriptor = Object.create(descriptorPrototype);

    // Record the component responsible for creating this descriptor.
    descriptor._owner = ReactCurrentOwner.current;

    // TODO: Deprecate withContext, and then the context becomes accessible
    // through the owner.
    descriptor._context = ReactContext.current;

    if ("production" !== "development") {
      // The validation flag and props are currently mutative. We put them on
      // an external backing store so that we can freeze the whole object.
      // This can be replaced with a WeakMap once they are implemented in
      // commonly used development environments.
      descriptor._store = { validated: false, props: props };

      // We're not allowed to set props directly on the object so we early
      // return and rely on the prototype membrane to forward to the backing
      // store.
      if (useMutationMembrane) {
        Object.freeze(descriptor);
        return descriptor;
      }
    }

    descriptor.props = props;
    return descriptor;
  };

  // Currently we expose the prototype of the descriptor so that
  // <Foo /> instanceof Foo works. This is controversial pattern.
  factory.prototype = descriptorPrototype;

  // Expose the type on the factory and the prototype so that it can be
  // easily accessed on descriptors. E.g. <Foo />.type === Foo.type and for
  // static methods like <Foo />.type.staticMethod();
  // This should not be named constructor since this may not be the function
  // that created the descriptor, and it may not even be a constructor.
  factory.type = type;
  descriptorPrototype.type = type;

  proxyStaticMethods(factory, type);

  // Expose a unique constructor on the prototype is that this works with type
  // systems that compare constructor properties: <Foo />.constructor === Foo
  // This may be controversial since it requires a known factory function.
  descriptorPrototype.constructor = factory;

  return factory;

};

ReactDescriptor.cloneAndReplaceProps = function(oldDescriptor, newProps) {
  var newDescriptor = Object.create(oldDescriptor.constructor.prototype);
  // It's important that this property order matches the hidden class of the
  // original descriptor to maintain perf.
  newDescriptor._owner = oldDescriptor._owner;
  newDescriptor._context = oldDescriptor._context;

  if ("production" !== "development") {
    newDescriptor._store = {
      validated: oldDescriptor._store.validated,
      props: newProps
    };
    if (useMutationMembrane) {
      Object.freeze(newDescriptor);
      return newDescriptor;
    }
  }

  newDescriptor.props = newProps;
  return newDescriptor;
};

/**
 * Checks if a value is a valid descriptor constructor.
 *
 * @param {*}
 * @return {boolean}
 * @public
 */
ReactDescriptor.isValidFactory = function(factory) {
  return typeof factory === 'function' &&
         factory.prototype instanceof ReactDescriptor;
};

/**
 * @param {?object} object
 * @return {boolean} True if `object` is a valid component.
 * @final
 */
ReactDescriptor.isValidDescriptor = function(object) {
  return object instanceof ReactDescriptor;
};

module.exports = ReactDescriptor;

},{"./ReactContext":34,"./ReactCurrentOwner":35,"./merge":130,"./warning":143}],52:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactDescriptorValidator
 */

/**
 * ReactDescriptorValidator provides a wrapper around a descriptor factory
 * which validates the props passed to the descriptor. This is intended to be
 * used only in DEV and could be replaced by a static type checker for languages
 * that support it.
 */

"use strict";

var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactPropTypeLocations = _dereq_("./ReactPropTypeLocations");
var ReactCurrentOwner = _dereq_("./ReactCurrentOwner");

var monitorCodeUse = _dereq_("./monitorCodeUse");

/**
 * Warn if there's no key explicitly set on dynamic arrays of children or
 * object keys are not valid. This allows us to keep track of children between
 * updates.
 */
var ownerHasKeyUseWarning = {
  'react_key_warning': {},
  'react_numeric_key_warning': {}
};
var ownerHasMonitoredObjectMap = {};

var loggedTypeFailures = {};

var NUMERIC_PROPERTY_REGEX = /^\d+$/;

/**
 * Gets the current owner's displayName for use in warnings.
 *
 * @internal
 * @return {?string} Display name or undefined
 */
function getCurrentOwnerDisplayName() {
  var current = ReactCurrentOwner.current;
  return current && current.constructor.displayName || undefined;
}

/**
 * Warn if the component doesn't have an explicit key assigned to it.
 * This component is in an array. The array could grow and shrink or be
 * reordered. All children that haven't already been validated are required to
 * have a "key" property assigned to it.
 *
 * @internal
 * @param {ReactComponent} component Component that requires a key.
 * @param {*} parentType component's parent's type.
 */
function validateExplicitKey(component, parentType) {
  if (component._store.validated || component.props.key != null) {
    return;
  }
  component._store.validated = true;

  warnAndMonitorForKeyUse(
    'react_key_warning',
    'Each child in an array should have a unique "key" prop.',
    component,
    parentType
  );
}

/**
 * Warn if the key is being defined as an object property but has an incorrect
 * value.
 *
 * @internal
 * @param {string} name Property name of the key.
 * @param {ReactComponent} component Component that requires a key.
 * @param {*} parentType component's parent's type.
 */
function validatePropertyKey(name, component, parentType) {
  if (!NUMERIC_PROPERTY_REGEX.test(name)) {
    return;
  }
  warnAndMonitorForKeyUse(
    'react_numeric_key_warning',
    'Child objects should have non-numeric keys so ordering is preserved.',
    component,
    parentType
  );
}

/**
 * Shared warning and monitoring code for the key warnings.
 *
 * @internal
 * @param {string} warningID The id used when logging.
 * @param {string} message The base warning that gets output.
 * @param {ReactComponent} component Component that requires a key.
 * @param {*} parentType component's parent's type.
 */
function warnAndMonitorForKeyUse(warningID, message, component, parentType) {
  var ownerName = getCurrentOwnerDisplayName();
  var parentName = parentType.displayName;

  var useName = ownerName || parentName;
  var memoizer = ownerHasKeyUseWarning[warningID];
  if (memoizer.hasOwnProperty(useName)) {
    return;
  }
  memoizer[useName] = true;

  message += ownerName ?
    (" Check the render method of " + ownerName + ".") :
    (" Check the renderComponent call using <" + parentName + ">.");

  // Usually the current owner is the offender, but if it accepts children as a
  // property, it may be the creator of the child that's responsible for
  // assigning it a key.
  var childOwnerName = null;
  if (component._owner && component._owner !== ReactCurrentOwner.current) {
    // Name of the component that originally created this child.
    childOwnerName = component._owner.constructor.displayName;

    message += (" It was passed a child from " + childOwnerName + ".");
  }

  message += ' See http://fb.me/react-warning-keys for more information.';
  monitorCodeUse(warningID, {
    component: useName,
    componentOwner: childOwnerName
  });
  console.warn(message);
}

/**
 * Log that we're using an object map. We're considering deprecating this
 * feature and replace it with proper Map and ImmutableMap data structures.
 *
 * @internal
 */
function monitorUseOfObjectMap() {
  var currentName = getCurrentOwnerDisplayName() || '';
  if (ownerHasMonitoredObjectMap.hasOwnProperty(currentName)) {
    return;
  }
  ownerHasMonitoredObjectMap[currentName] = true;
  monitorCodeUse('react_object_map_children');
}

/**
 * Ensure that every component either is passed in a static location, in an
 * array with an explicit keys property defined, or in an object literal
 * with valid key property.
 *
 * @internal
 * @param {*} component Statically passed child of any type.
 * @param {*} parentType component's parent's type.
 * @return {boolean}
 */
function validateChildKeys(component, parentType) {
  if (Array.isArray(component)) {
    for (var i = 0; i < component.length; i++) {
      var child = component[i];
      if (ReactDescriptor.isValidDescriptor(child)) {
        validateExplicitKey(child, parentType);
      }
    }
  } else if (ReactDescriptor.isValidDescriptor(component)) {
    // This component was passed in a valid location.
    component._store.validated = true;
  } else if (component && typeof component === 'object') {
    monitorUseOfObjectMap();
    for (var name in component) {
      validatePropertyKey(name, component[name], parentType);
    }
  }
}

/**
 * Assert that the props are valid
 *
 * @param {string} componentName Name of the component for error messages.
 * @param {object} propTypes Map of prop name to a ReactPropType
 * @param {object} props
 * @param {string} location e.g. "prop", "context", "child context"
 * @private
 */
function checkPropTypes(componentName, propTypes, props, location) {
  for (var propName in propTypes) {
    if (propTypes.hasOwnProperty(propName)) {
      var error;
      // Prop type validation may throw. In case they do, we don't want to
      // fail the render phase where it didn't fail before. So we log it.
      // After these have been cleaned up, we'll let them throw.
      try {
        error = propTypes[propName](props, propName, componentName, location);
      } catch (ex) {
        error = ex;
      }
      if (error instanceof Error && !(error.message in loggedTypeFailures)) {
        // Only monitor this failure once because there tends to be a lot of the
        // same error.
        loggedTypeFailures[error.message] = true;
        // This will soon use the warning module
        monitorCodeUse(
          'react_failed_descriptor_type_check',
          { message: error.message }
        );
      }
    }
  }
}

var ReactDescriptorValidator = {

  /**
   * Wraps a descriptor factory function in another function which validates
   * the props and context of the descriptor and warns about any failed type
   * checks.
   *
   * @param {function} factory The original descriptor factory
   * @param {object?} propTypes A prop type definition set
   * @param {object?} contextTypes A context type definition set
   * @return {object} The component descriptor, which may be invalid.
   * @private
   */
  createFactory: function(factory, propTypes, contextTypes) {
    var validatedFactory = function(props, children) {
      var descriptor = factory.apply(this, arguments);

      for (var i = 1; i < arguments.length; i++) {
        validateChildKeys(arguments[i], descriptor.type);
      }

      var name = descriptor.type.displayName;
      if (propTypes) {
        checkPropTypes(
          name,
          propTypes,
          descriptor.props,
          ReactPropTypeLocations.prop
        );
      }
      if (contextTypes) {
        checkPropTypes(
          name,
          contextTypes,
          descriptor._context,
          ReactPropTypeLocations.context
        );
      }
      return descriptor;
    };

    validatedFactory.prototype = factory.prototype;
    validatedFactory.type = factory.type;

    // Copy static properties
    for (var key in factory) {
      if (factory.hasOwnProperty(key)) {
        validatedFactory[key] = factory[key];
      }
    }

    return validatedFactory;
  }

};

module.exports = ReactDescriptorValidator;

},{"./ReactCurrentOwner":35,"./ReactDescriptor":51,"./ReactPropTypeLocations":68,"./monitorCodeUse":134}],53:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactEmptyComponent
 */

"use strict";

var invariant = _dereq_("./invariant");

var component;
// This registry keeps track of the React IDs of the components that rendered to
// `null` (in reality a placeholder such as `noscript`)
var nullComponentIdsRegistry = {};

var ReactEmptyComponentInjection = {
  injectEmptyComponent: function(emptyComponent) {
    component = emptyComponent;
  }
};

/**
 * @return {ReactComponent} component The injected empty component.
 */
function getEmptyComponent() {
  ("production" !== "development" ? invariant(
    component,
    'Trying to return null from a render, but no null placeholder component ' +
    'was injected.'
  ) : invariant(component));
  return component();
}

/**
 * Mark the component as having rendered to null.
 * @param {string} id Component's `_rootNodeID`.
 */
function registerNullComponentID(id) {
  nullComponentIdsRegistry[id] = true;
}

/**
 * Unmark the component as having rendered to null: it renders to something now.
 * @param {string} id Component's `_rootNodeID`.
 */
function deregisterNullComponentID(id) {
  delete nullComponentIdsRegistry[id];
}

/**
 * @param {string} id Component's `_rootNodeID`.
 * @return {boolean} True if the component is rendered to null.
 */
function isNullComponentID(id) {
  return nullComponentIdsRegistry[id];
}

var ReactEmptyComponent = {
  deregisterNullComponentID: deregisterNullComponentID,
  getEmptyComponent: getEmptyComponent,
  injection: ReactEmptyComponentInjection,
  isNullComponentID: isNullComponentID,
  registerNullComponentID: registerNullComponentID
};

module.exports = ReactEmptyComponent;

},{"./invariant":120}],54:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactErrorUtils
 * @typechecks
 */

"use strict";

var ReactErrorUtils = {
  /**
   * Creates a guarded version of a function. This is supposed to make debugging
   * of event handlers easier. To aid debugging with the browser's debugger,
   * this currently simply returns the original function.
   *
   * @param {function} func Function to be executed
   * @param {string} name The name of the guard
   * @return {function}
   */
  guard: function(func, name) {
    return func;
  }
};

module.exports = ReactErrorUtils;

},{}],55:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactEventEmitterMixin
 */

"use strict";

var EventPluginHub = _dereq_("./EventPluginHub");

function runEventQueueInBatch(events) {
  EventPluginHub.enqueueEvents(events);
  EventPluginHub.processEventQueue();
}

var ReactEventEmitterMixin = {

  /**
   * Streams a fired top-level event to `EventPluginHub` where plugins have the
   * opportunity to create `ReactEvent`s to be dispatched.
   *
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {object} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native environment event.
   */
  handleTopLevel: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {
    var events = EventPluginHub.extractEvents(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent
    );

    runEventQueueInBatch(events);
  }
};

module.exports = ReactEventEmitterMixin;

},{"./EventPluginHub":17}],56:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactEventListener
 * @typechecks static-only
 */

"use strict";

var EventListener = _dereq_("./EventListener");
var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");
var PooledClass = _dereq_("./PooledClass");
var ReactInstanceHandles = _dereq_("./ReactInstanceHandles");
var ReactMount = _dereq_("./ReactMount");
var ReactUpdates = _dereq_("./ReactUpdates");

var getEventTarget = _dereq_("./getEventTarget");
var getUnboundedScrollPosition = _dereq_("./getUnboundedScrollPosition");
var mixInto = _dereq_("./mixInto");

/**
 * Finds the parent React component of `node`.
 *
 * @param {*} node
 * @return {?DOMEventTarget} Parent container, or `null` if the specified node
 *                           is not nested.
 */
function findParent(node) {
  // TODO: It may be a good idea to cache this to prevent unnecessary DOM
  // traversal, but caching is difficult to do correctly without using a
  // mutation observer to listen for all DOM changes.
  var nodeID = ReactMount.getID(node);
  var rootID = ReactInstanceHandles.getReactRootIDFromNodeID(nodeID);
  var container = ReactMount.findReactContainerForID(rootID);
  var parent = ReactMount.getFirstReactDOM(container);
  return parent;
}

// Used to store ancestor hierarchy in top level callback
function TopLevelCallbackBookKeeping(topLevelType, nativeEvent) {
  this.topLevelType = topLevelType;
  this.nativeEvent = nativeEvent;
  this.ancestors = [];
}
mixInto(TopLevelCallbackBookKeeping, {
  destructor: function() {
    this.topLevelType = null;
    this.nativeEvent = null;
    this.ancestors.length = 0;
  }
});
PooledClass.addPoolingTo(
  TopLevelCallbackBookKeeping,
  PooledClass.twoArgumentPooler
);

function handleTopLevelImpl(bookKeeping) {
  var topLevelTarget = ReactMount.getFirstReactDOM(
    getEventTarget(bookKeeping.nativeEvent)
  ) || window;

  // Loop through the hierarchy, in case there's any nested components.
  // It's important that we build the array of ancestors before calling any
  // event handlers, because event handlers can modify the DOM, leading to
  // inconsistencies with ReactMount's node cache. See #1105.
  var ancestor = topLevelTarget;
  while (ancestor) {
    bookKeeping.ancestors.push(ancestor);
    ancestor = findParent(ancestor);
  }

  for (var i = 0, l = bookKeeping.ancestors.length; i < l; i++) {
    topLevelTarget = bookKeeping.ancestors[i];
    var topLevelTargetID = ReactMount.getID(topLevelTarget) || '';
    ReactEventListener._handleTopLevel(
      bookKeeping.topLevelType,
      topLevelTarget,
      topLevelTargetID,
      bookKeeping.nativeEvent
    );
  }
}

function scrollValueMonitor(cb) {
  var scrollPosition = getUnboundedScrollPosition(window);
  cb(scrollPosition);
}

var ReactEventListener = {
  _enabled: true,
  _handleTopLevel: null,

  WINDOW_HANDLE: ExecutionEnvironment.canUseDOM ? window : null,

  setHandleTopLevel: function(handleTopLevel) {
    ReactEventListener._handleTopLevel = handleTopLevel;
  },

  setEnabled: function(enabled) {
    ReactEventListener._enabled = !!enabled;
  },

  isEnabled: function() {
    return ReactEventListener._enabled;
  },


  /**
   * Traps top-level events by using event bubbling.
   *
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {string} handlerBaseName Event name (e.g. "click").
   * @param {object} handle Element on which to attach listener.
   * @return {object} An object with a remove function which will forcefully
   *                  remove the listener.
   * @internal
   */
  trapBubbledEvent: function(topLevelType, handlerBaseName, handle) {
    var element = handle;
    if (!element) {
      return;
    }
    return EventListener.listen(
      element,
      handlerBaseName,
      ReactEventListener.dispatchEvent.bind(null, topLevelType)
    );
  },

  /**
   * Traps a top-level event by using event capturing.
   *
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {string} handlerBaseName Event name (e.g. "click").
   * @param {object} handle Element on which to attach listener.
   * @return {object} An object with a remove function which will forcefully
   *                  remove the listener.
   * @internal
   */
  trapCapturedEvent: function(topLevelType, handlerBaseName, handle) {
    var element = handle;
    if (!element) {
      return;
    }
    return EventListener.capture(
      element,
      handlerBaseName,
      ReactEventListener.dispatchEvent.bind(null, topLevelType)
    );
  },

  monitorScrollValue: function(refresh) {
    var callback = scrollValueMonitor.bind(null, refresh);
    EventListener.listen(window, 'scroll', callback);
    EventListener.listen(window, 'resize', callback);
  },

  dispatchEvent: function(topLevelType, nativeEvent) {
    if (!ReactEventListener._enabled) {
      return;
    }

    var bookKeeping = TopLevelCallbackBookKeeping.getPooled(
      topLevelType,
      nativeEvent
    );
    try {
      // Event queue being processed in the same cycle allows
      // `preventDefault`.
      ReactUpdates.batchedUpdates(handleTopLevelImpl, bookKeeping);
    } finally {
      TopLevelCallbackBookKeeping.release(bookKeeping);
    }
  }
};

module.exports = ReactEventListener;

},{"./EventListener":16,"./ExecutionEnvironment":21,"./PooledClass":26,"./ReactInstanceHandles":59,"./ReactMount":61,"./ReactUpdates":76,"./getEventTarget":111,"./getUnboundedScrollPosition":116,"./mixInto":133}],57:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactInjection
 */

"use strict";

var DOMProperty = _dereq_("./DOMProperty");
var EventPluginHub = _dereq_("./EventPluginHub");
var ReactComponent = _dereq_("./ReactComponent");
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");
var ReactDOM = _dereq_("./ReactDOM");
var ReactEmptyComponent = _dereq_("./ReactEmptyComponent");
var ReactBrowserEventEmitter = _dereq_("./ReactBrowserEventEmitter");
var ReactPerf = _dereq_("./ReactPerf");
var ReactRootIndex = _dereq_("./ReactRootIndex");
var ReactUpdates = _dereq_("./ReactUpdates");

var ReactInjection = {
  Component: ReactComponent.injection,
  CompositeComponent: ReactCompositeComponent.injection,
  DOMProperty: DOMProperty.injection,
  EmptyComponent: ReactEmptyComponent.injection,
  EventPluginHub: EventPluginHub.injection,
  DOM: ReactDOM.injection,
  EventEmitter: ReactBrowserEventEmitter.injection,
  Perf: ReactPerf.injection,
  RootIndex: ReactRootIndex.injection,
  Updates: ReactUpdates.injection
};

module.exports = ReactInjection;

},{"./DOMProperty":10,"./EventPluginHub":17,"./ReactBrowserEventEmitter":29,"./ReactComponent":31,"./ReactCompositeComponent":33,"./ReactDOM":36,"./ReactEmptyComponent":53,"./ReactPerf":65,"./ReactRootIndex":72,"./ReactUpdates":76}],58:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactInputSelection
 */

"use strict";

var ReactDOMSelection = _dereq_("./ReactDOMSelection");

var containsNode = _dereq_("./containsNode");
var focusNode = _dereq_("./focusNode");
var getActiveElement = _dereq_("./getActiveElement");

function isInDocument(node) {
  return containsNode(document.documentElement, node);
}

/**
 * @ReactInputSelection: React input selection module. Based on Selection.js,
 * but modified to be suitable for react and has a couple of bug fixes (doesn't
 * assume buttons have range selections allowed).
 * Input selection module for React.
 */
var ReactInputSelection = {

  hasSelectionCapabilities: function(elem) {
    return elem && (
      (elem.nodeName === 'INPUT' && elem.type === 'text') ||
      elem.nodeName === 'TEXTAREA' ||
      elem.contentEditable === 'true'
    );
  },

  getSelectionInformation: function() {
    var focusedElem = getActiveElement();
    return {
      focusedElem: focusedElem,
      selectionRange:
          ReactInputSelection.hasSelectionCapabilities(focusedElem) ?
          ReactInputSelection.getSelection(focusedElem) :
          null
    };
  },

  /**
   * @restoreSelection: If any selection information was potentially lost,
   * restore it. This is useful when performing operations that could remove dom
   * nodes and place them back in, resulting in focus being lost.
   */
  restoreSelection: function(priorSelectionInformation) {
    var curFocusedElem = getActiveElement();
    var priorFocusedElem = priorSelectionInformation.focusedElem;
    var priorSelectionRange = priorSelectionInformation.selectionRange;
    if (curFocusedElem !== priorFocusedElem &&
        isInDocument(priorFocusedElem)) {
      if (ReactInputSelection.hasSelectionCapabilities(priorFocusedElem)) {
        ReactInputSelection.setSelection(
          priorFocusedElem,
          priorSelectionRange
        );
      }
      focusNode(priorFocusedElem);
    }
  },

  /**
   * @getSelection: Gets the selection bounds of a focused textarea, input or
   * contentEditable node.
   * -@input: Look up selection bounds of this input
   * -@return {start: selectionStart, end: selectionEnd}
   */
  getSelection: function(input) {
    var selection;

    if ('selectionStart' in input) {
      // Modern browser with input or textarea.
      selection = {
        start: input.selectionStart,
        end: input.selectionEnd
      };
    } else if (document.selection && input.nodeName === 'INPUT') {
      // IE8 input.
      var range = document.selection.createRange();
      // There can only be one selection per document in IE, so it must
      // be in our element.
      if (range.parentElement() === input) {
        selection = {
          start: -range.moveStart('character', -input.value.length),
          end: -range.moveEnd('character', -input.value.length)
        };
      }
    } else {
      // Content editable or old IE textarea.
      selection = ReactDOMSelection.getOffsets(input);
    }

    return selection || {start: 0, end: 0};
  },

  /**
   * @setSelection: Sets the selection bounds of a textarea or input and focuses
   * the input.
   * -@input     Set selection bounds of this input or textarea
   * -@offsets   Object of same form that is returned from get*
   */
  setSelection: function(input, offsets) {
    var start = offsets.start;
    var end = offsets.end;
    if (typeof end === 'undefined') {
      end = start;
    }

    if ('selectionStart' in input) {
      input.selectionStart = start;
      input.selectionEnd = Math.min(end, input.value.length);
    } else if (document.selection && input.nodeName === 'INPUT') {
      var range = input.createTextRange();
      range.collapse(true);
      range.moveStart('character', start);
      range.moveEnd('character', end - start);
      range.select();
    } else {
      ReactDOMSelection.setOffsets(input, offsets);
    }
  }
};

module.exports = ReactInputSelection;

},{"./ReactDOMSelection":45,"./containsNode":96,"./focusNode":106,"./getActiveElement":108}],59:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactInstanceHandles
 * @typechecks static-only
 */

"use strict";

var ReactRootIndex = _dereq_("./ReactRootIndex");

var invariant = _dereq_("./invariant");

var SEPARATOR = '.';
var SEPARATOR_LENGTH = SEPARATOR.length;

/**
 * Maximum depth of traversals before we consider the possibility of a bad ID.
 */
var MAX_TREE_DEPTH = 100;

/**
 * Creates a DOM ID prefix to use when mounting React components.
 *
 * @param {number} index A unique integer
 * @return {string} React root ID.
 * @internal
 */
function getReactRootIDString(index) {
  return SEPARATOR + index.toString(36);
}

/**
 * Checks if a character in the supplied ID is a separator or the end.
 *
 * @param {string} id A React DOM ID.
 * @param {number} index Index of the character to check.
 * @return {boolean} True if the character is a separator or end of the ID.
 * @private
 */
function isBoundary(id, index) {
  return id.charAt(index) === SEPARATOR || index === id.length;
}

/**
 * Checks if the supplied string is a valid React DOM ID.
 *
 * @param {string} id A React DOM ID, maybe.
 * @return {boolean} True if the string is a valid React DOM ID.
 * @private
 */
function isValidID(id) {
  return id === '' || (
    id.charAt(0) === SEPARATOR && id.charAt(id.length - 1) !== SEPARATOR
  );
}

/**
 * Checks if the first ID is an ancestor of or equal to the second ID.
 *
 * @param {string} ancestorID
 * @param {string} descendantID
 * @return {boolean} True if `ancestorID` is an ancestor of `descendantID`.
 * @internal
 */
function isAncestorIDOf(ancestorID, descendantID) {
  return (
    descendantID.indexOf(ancestorID) === 0 &&
    isBoundary(descendantID, ancestorID.length)
  );
}

/**
 * Gets the parent ID of the supplied React DOM ID, `id`.
 *
 * @param {string} id ID of a component.
 * @return {string} ID of the parent, or an empty string.
 * @private
 */
function getParentID(id) {
  return id ? id.substr(0, id.lastIndexOf(SEPARATOR)) : '';
}

/**
 * Gets the next DOM ID on the tree path from the supplied `ancestorID` to the
 * supplied `destinationID`. If they are equal, the ID is returned.
 *
 * @param {string} ancestorID ID of an ancestor node of `destinationID`.
 * @param {string} destinationID ID of the destination node.
 * @return {string} Next ID on the path from `ancestorID` to `destinationID`.
 * @private
 */
function getNextDescendantID(ancestorID, destinationID) {
  ("production" !== "development" ? invariant(
    isValidID(ancestorID) && isValidID(destinationID),
    'getNextDescendantID(%s, %s): Received an invalid React DOM ID.',
    ancestorID,
    destinationID
  ) : invariant(isValidID(ancestorID) && isValidID(destinationID)));
  ("production" !== "development" ? invariant(
    isAncestorIDOf(ancestorID, destinationID),
    'getNextDescendantID(...): React has made an invalid assumption about ' +
    'the DOM hierarchy. Expected `%s` to be an ancestor of `%s`.',
    ancestorID,
    destinationID
  ) : invariant(isAncestorIDOf(ancestorID, destinationID)));
  if (ancestorID === destinationID) {
    return ancestorID;
  }
  // Skip over the ancestor and the immediate separator. Traverse until we hit
  // another separator or we reach the end of `destinationID`.
  var start = ancestorID.length + SEPARATOR_LENGTH;
  for (var i = start; i < destinationID.length; i++) {
    if (isBoundary(destinationID, i)) {
      break;
    }
  }
  return destinationID.substr(0, i);
}

/**
 * Gets the nearest common ancestor ID of two IDs.
 *
 * Using this ID scheme, the nearest common ancestor ID is the longest common
 * prefix of the two IDs that immediately preceded a "marker" in both strings.
 *
 * @param {string} oneID
 * @param {string} twoID
 * @return {string} Nearest common ancestor ID, or the empty string if none.
 * @private
 */
function getFirstCommonAncestorID(oneID, twoID) {
  var minLength = Math.min(oneID.length, twoID.length);
  if (minLength === 0) {
    return '';
  }
  var lastCommonMarkerIndex = 0;
  // Use `<=` to traverse until the "EOL" of the shorter string.
  for (var i = 0; i <= minLength; i++) {
    if (isBoundary(oneID, i) && isBoundary(twoID, i)) {
      lastCommonMarkerIndex = i;
    } else if (oneID.charAt(i) !== twoID.charAt(i)) {
      break;
    }
  }
  var longestCommonID = oneID.substr(0, lastCommonMarkerIndex);
  ("production" !== "development" ? invariant(
    isValidID(longestCommonID),
    'getFirstCommonAncestorID(%s, %s): Expected a valid React DOM ID: %s',
    oneID,
    twoID,
    longestCommonID
  ) : invariant(isValidID(longestCommonID)));
  return longestCommonID;
}

/**
 * Traverses the parent path between two IDs (either up or down). The IDs must
 * not be the same, and there must exist a parent path between them. If the
 * callback returns `false`, traversal is stopped.
 *
 * @param {?string} start ID at which to start traversal.
 * @param {?string} stop ID at which to end traversal.
 * @param {function} cb Callback to invoke each ID with.
 * @param {?boolean} skipFirst Whether or not to skip the first node.
 * @param {?boolean} skipLast Whether or not to skip the last node.
 * @private
 */
function traverseParentPath(start, stop, cb, arg, skipFirst, skipLast) {
  start = start || '';
  stop = stop || '';
  ("production" !== "development" ? invariant(
    start !== stop,
    'traverseParentPath(...): Cannot traverse from and to the same ID, `%s`.',
    start
  ) : invariant(start !== stop));
  var traverseUp = isAncestorIDOf(stop, start);
  ("production" !== "development" ? invariant(
    traverseUp || isAncestorIDOf(start, stop),
    'traverseParentPath(%s, %s, ...): Cannot traverse from two IDs that do ' +
    'not have a parent path.',
    start,
    stop
  ) : invariant(traverseUp || isAncestorIDOf(start, stop)));
  // Traverse from `start` to `stop` one depth at a time.
  var depth = 0;
  var traverse = traverseUp ? getParentID : getNextDescendantID;
  for (var id = start; /* until break */; id = traverse(id, stop)) {
    var ret;
    if ((!skipFirst || id !== start) && (!skipLast || id !== stop)) {
      ret = cb(id, traverseUp, arg);
    }
    if (ret === false || id === stop) {
      // Only break //after// visiting `stop`.
      break;
    }
    ("production" !== "development" ? invariant(
      depth++ < MAX_TREE_DEPTH,
      'traverseParentPath(%s, %s, ...): Detected an infinite loop while ' +
      'traversing the React DOM ID tree. This may be due to malformed IDs: %s',
      start, stop
    ) : invariant(depth++ < MAX_TREE_DEPTH));
  }
}

/**
 * Manages the IDs assigned to DOM representations of React components. This
 * uses a specific scheme in order to traverse the DOM efficiently (e.g. in
 * order to simulate events).
 *
 * @internal
 */
var ReactInstanceHandles = {

  /**
   * Constructs a React root ID
   * @return {string} A React root ID.
   */
  createReactRootID: function() {
    return getReactRootIDString(ReactRootIndex.createReactRootIndex());
  },

  /**
   * Constructs a React ID by joining a root ID with a name.
   *
   * @param {string} rootID Root ID of a parent component.
   * @param {string} name A component's name (as flattened children).
   * @return {string} A React ID.
   * @internal
   */
  createReactID: function(rootID, name) {
    return rootID + name;
  },

  /**
   * Gets the DOM ID of the React component that is the root of the tree that
   * contains the React component with the supplied DOM ID.
   *
   * @param {string} id DOM ID of a React component.
   * @return {?string} DOM ID of the React component that is the root.
   * @internal
   */
  getReactRootIDFromNodeID: function(id) {
    if (id && id.charAt(0) === SEPARATOR && id.length > 1) {
      var index = id.indexOf(SEPARATOR, 1);
      return index > -1 ? id.substr(0, index) : id;
    }
    return null;
  },

  /**
   * Traverses the ID hierarchy and invokes the supplied `cb` on any IDs that
   * should would receive a `mouseEnter` or `mouseLeave` event.
   *
   * NOTE: Does not invoke the callback on the nearest common ancestor because
   * nothing "entered" or "left" that element.
   *
   * @param {string} leaveID ID being left.
   * @param {string} enterID ID being entered.
   * @param {function} cb Callback to invoke on each entered/left ID.
   * @param {*} upArg Argument to invoke the callback with on left IDs.
   * @param {*} downArg Argument to invoke the callback with on entered IDs.
   * @internal
   */
  traverseEnterLeave: function(leaveID, enterID, cb, upArg, downArg) {
    var ancestorID = getFirstCommonAncestorID(leaveID, enterID);
    if (ancestorID !== leaveID) {
      traverseParentPath(leaveID, ancestorID, cb, upArg, false, true);
    }
    if (ancestorID !== enterID) {
      traverseParentPath(ancestorID, enterID, cb, downArg, true, false);
    }
  },

  /**
   * Simulates the traversal of a two-phase, capture/bubble event dispatch.
   *
   * NOTE: This traversal happens on IDs without touching the DOM.
   *
   * @param {string} targetID ID of the target node.
   * @param {function} cb Callback to invoke.
   * @param {*} arg Argument to invoke the callback with.
   * @internal
   */
  traverseTwoPhase: function(targetID, cb, arg) {
    if (targetID) {
      traverseParentPath('', targetID, cb, arg, true, false);
      traverseParentPath(targetID, '', cb, arg, false, true);
    }
  },

  /**
   * Traverse a node ID, calling the supplied `cb` for each ancestor ID. For
   * example, passing `.0.$row-0.1` would result in `cb` getting called
   * with `.0`, `.0.$row-0`, and `.0.$row-0.1`.
   *
   * NOTE: This traversal happens on IDs without touching the DOM.
   *
   * @param {string} targetID ID of the target node.
   * @param {function} cb Callback to invoke.
   * @param {*} arg Argument to invoke the callback with.
   * @internal
   */
  traverseAncestors: function(targetID, cb, arg) {
    traverseParentPath('', targetID, cb, arg, true, false);
  },

  /**
   * Exposed for unit testing.
   * @private
   */
  _getFirstCommonAncestorID: getFirstCommonAncestorID,

  /**
   * Exposed for unit testing.
   * @private
   */
  _getNextDescendantID: getNextDescendantID,

  isAncestorIDOf: isAncestorIDOf,

  SEPARATOR: SEPARATOR

};

module.exports = ReactInstanceHandles;

},{"./ReactRootIndex":72,"./invariant":120}],60:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactMarkupChecksum
 */

"use strict";

var adler32 = _dereq_("./adler32");

var ReactMarkupChecksum = {
  CHECKSUM_ATTR_NAME: 'data-react-checksum',

  /**
   * @param {string} markup Markup string
   * @return {string} Markup string with checksum attribute attached
   */
  addChecksumToMarkup: function(markup) {
    var checksum = adler32(markup);
    return markup.replace(
      '>',
      ' ' + ReactMarkupChecksum.CHECKSUM_ATTR_NAME + '="' + checksum + '">'
    );
  },

  /**
   * @param {string} markup to use
   * @param {DOMElement} element root React element
   * @returns {boolean} whether or not the markup is the same
   */
  canReuseMarkup: function(markup, element) {
    var existingChecksum = element.getAttribute(
      ReactMarkupChecksum.CHECKSUM_ATTR_NAME
    );
    existingChecksum = existingChecksum && parseInt(existingChecksum, 10);
    var markupChecksum = adler32(markup);
    return markupChecksum === existingChecksum;
  }
};

module.exports = ReactMarkupChecksum;

},{"./adler32":95}],61:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactMount
 */

"use strict";

var DOMProperty = _dereq_("./DOMProperty");
var ReactBrowserEventEmitter = _dereq_("./ReactBrowserEventEmitter");
var ReactCurrentOwner = _dereq_("./ReactCurrentOwner");
var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactInstanceHandles = _dereq_("./ReactInstanceHandles");
var ReactPerf = _dereq_("./ReactPerf");

var containsNode = _dereq_("./containsNode");
var getReactRootElementInContainer = _dereq_("./getReactRootElementInContainer");
var instantiateReactComponent = _dereq_("./instantiateReactComponent");
var invariant = _dereq_("./invariant");
var shouldUpdateReactComponent = _dereq_("./shouldUpdateReactComponent");
var warning = _dereq_("./warning");

var SEPARATOR = ReactInstanceHandles.SEPARATOR;

var ATTR_NAME = DOMProperty.ID_ATTRIBUTE_NAME;
var nodeCache = {};

var ELEMENT_NODE_TYPE = 1;
var DOC_NODE_TYPE = 9;

/** Mapping from reactRootID to React component instance. */
var instancesByReactRootID = {};

/** Mapping from reactRootID to `container` nodes. */
var containersByReactRootID = {};

if ("production" !== "development") {
  /** __DEV__-only mapping from reactRootID to root elements. */
  var rootElementsByReactRootID = {};
}

// Used to store breadth-first search state in findComponentRoot.
var findComponentRootReusableArray = [];

/**
 * @param {DOMElement} container DOM element that may contain a React component.
 * @return {?string} A "reactRoot" ID, if a React component is rendered.
 */
function getReactRootID(container) {
  var rootElement = getReactRootElementInContainer(container);
  return rootElement && ReactMount.getID(rootElement);
}

/**
 * Accessing node[ATTR_NAME] or calling getAttribute(ATTR_NAME) on a form
 * element can return its control whose name or ID equals ATTR_NAME. All
 * DOM nodes support `getAttributeNode` but this can also get called on
 * other objects so just return '' if we're given something other than a
 * DOM node (such as window).
 *
 * @param {?DOMElement|DOMWindow|DOMDocument|DOMTextNode} node DOM node.
 * @return {string} ID of the supplied `domNode`.
 */
function getID(node) {
  var id = internalGetID(node);
  if (id) {
    if (nodeCache.hasOwnProperty(id)) {
      var cached = nodeCache[id];
      if (cached !== node) {
        ("production" !== "development" ? invariant(
          !isValid(cached, id),
          'ReactMount: Two valid but unequal nodes with the same `%s`: %s',
          ATTR_NAME, id
        ) : invariant(!isValid(cached, id)));

        nodeCache[id] = node;
      }
    } else {
      nodeCache[id] = node;
    }
  }

  return id;
}

function internalGetID(node) {
  // If node is something like a window, document, or text node, none of
  // which support attributes or a .getAttribute method, gracefully return
  // the empty string, as if the attribute were missing.
  return node && node.getAttribute && node.getAttribute(ATTR_NAME) || '';
}

/**
 * Sets the React-specific ID of the given node.
 *
 * @param {DOMElement} node The DOM node whose ID will be set.
 * @param {string} id The value of the ID attribute.
 */
function setID(node, id) {
  var oldID = internalGetID(node);
  if (oldID !== id) {
    delete nodeCache[oldID];
  }
  node.setAttribute(ATTR_NAME, id);
  nodeCache[id] = node;
}

/**
 * Finds the node with the supplied React-generated DOM ID.
 *
 * @param {string} id A React-generated DOM ID.
 * @return {DOMElement} DOM node with the suppled `id`.
 * @internal
 */
function getNode(id) {
  if (!nodeCache.hasOwnProperty(id) || !isValid(nodeCache[id], id)) {
    nodeCache[id] = ReactMount.findReactNodeByID(id);
  }
  return nodeCache[id];
}

/**
 * A node is "valid" if it is contained by a currently mounted container.
 *
 * This means that the node does not have to be contained by a document in
 * order to be considered valid.
 *
 * @param {?DOMElement} node The candidate DOM node.
 * @param {string} id The expected ID of the node.
 * @return {boolean} Whether the node is contained by a mounted container.
 */
function isValid(node, id) {
  if (node) {
    ("production" !== "development" ? invariant(
      internalGetID(node) === id,
      'ReactMount: Unexpected modification of `%s`',
      ATTR_NAME
    ) : invariant(internalGetID(node) === id));

    var container = ReactMount.findReactContainerForID(id);
    if (container && containsNode(container, node)) {
      return true;
    }
  }

  return false;
}

/**
 * Causes the cache to forget about one React-specific ID.
 *
 * @param {string} id The ID to forget.
 */
function purgeID(id) {
  delete nodeCache[id];
}

var deepestNodeSoFar = null;
function findDeepestCachedAncestorImpl(ancestorID) {
  var ancestor = nodeCache[ancestorID];
  if (ancestor && isValid(ancestor, ancestorID)) {
    deepestNodeSoFar = ancestor;
  } else {
    // This node isn't populated in the cache, so presumably none of its
    // descendants are. Break out of the loop.
    return false;
  }
}

/**
 * Return the deepest cached node whose ID is a prefix of `targetID`.
 */
function findDeepestCachedAncestor(targetID) {
  deepestNodeSoFar = null;
  ReactInstanceHandles.traverseAncestors(
    targetID,
    findDeepestCachedAncestorImpl
  );

  var foundNode = deepestNodeSoFar;
  deepestNodeSoFar = null;
  return foundNode;
}

/**
 * Mounting is the process of initializing a React component by creatings its
 * representative DOM elements and inserting them into a supplied `container`.
 * Any prior content inside `container` is destroyed in the process.
 *
 *   ReactMount.renderComponent(
 *     component,
 *     document.getElementById('container')
 *   );
 *
 *   <div id="container">                   <-- Supplied `container`.
 *     <div data-reactid=".3">              <-- Rendered reactRoot of React
 *       // ...                                 component.
 *     </div>
 *   </div>
 *
 * Inside of `container`, the first element rendered is the "reactRoot".
 */
var ReactMount = {
  /** Exposed for debugging purposes **/
  _instancesByReactRootID: instancesByReactRootID,

  /**
   * This is a hook provided to support rendering React components while
   * ensuring that the apparent scroll position of its `container` does not
   * change.
   *
   * @param {DOMElement} container The `container` being rendered into.
   * @param {function} renderCallback This must be called once to do the render.
   */
  scrollMonitor: function(container, renderCallback) {
    renderCallback();
  },

  /**
   * Take a component that's already mounted into the DOM and replace its props
   * @param {ReactComponent} prevComponent component instance already in the DOM
   * @param {ReactComponent} nextComponent component instance to render
   * @param {DOMElement} container container to render into
   * @param {?function} callback function triggered on completion
   */
  _updateRootComponent: function(
      prevComponent,
      nextComponent,
      container,
      callback) {
    var nextProps = nextComponent.props;
    ReactMount.scrollMonitor(container, function() {
      prevComponent.replaceProps(nextProps, callback);
    });

    if ("production" !== "development") {
      // Record the root element in case it later gets transplanted.
      rootElementsByReactRootID[getReactRootID(container)] =
        getReactRootElementInContainer(container);
    }

    return prevComponent;
  },

  /**
   * Register a component into the instance map and starts scroll value
   * monitoring
   * @param {ReactComponent} nextComponent component instance to render
   * @param {DOMElement} container container to render into
   * @return {string} reactRoot ID prefix
   */
  _registerComponent: function(nextComponent, container) {
    ("production" !== "development" ? invariant(
      container && (
        container.nodeType === ELEMENT_NODE_TYPE ||
        container.nodeType === DOC_NODE_TYPE
      ),
      '_registerComponent(...): Target container is not a DOM element.'
    ) : invariant(container && (
      container.nodeType === ELEMENT_NODE_TYPE ||
      container.nodeType === DOC_NODE_TYPE
    )));

    ReactBrowserEventEmitter.ensureScrollValueMonitoring();

    var reactRootID = ReactMount.registerContainer(container);
    instancesByReactRootID[reactRootID] = nextComponent;
    return reactRootID;
  },

  /**
   * Render a new component into the DOM.
   * @param {ReactComponent} nextComponent component instance to render
   * @param {DOMElement} container container to render into
   * @param {boolean} shouldReuseMarkup if we should skip the markup insertion
   * @return {ReactComponent} nextComponent
   */
  _renderNewRootComponent: ReactPerf.measure(
    'ReactMount',
    '_renderNewRootComponent',
    function(
        nextComponent,
        container,
        shouldReuseMarkup) {
      // Various parts of our code (such as ReactCompositeComponent's
      // _renderValidatedComponent) assume that calls to render aren't nested;
      // verify that that's the case.
      ("production" !== "development" ? warning(
        ReactCurrentOwner.current == null,
        '_renderNewRootComponent(): Render methods should be a pure function ' +
        'of props and state; triggering nested component updates from ' +
        'render is not allowed. If necessary, trigger nested updates in ' +
        'componentDidUpdate.'
      ) : null);

      var componentInstance = instantiateReactComponent(nextComponent);
      var reactRootID = ReactMount._registerComponent(
        componentInstance,
        container
      );
      componentInstance.mountComponentIntoNode(
        reactRootID,
        container,
        shouldReuseMarkup
      );

      if ("production" !== "development") {
        // Record the root element in case it later gets transplanted.
        rootElementsByReactRootID[reactRootID] =
          getReactRootElementInContainer(container);
      }

      return componentInstance;
    }
  ),

  /**
   * Renders a React component into the DOM in the supplied `container`.
   *
   * If the React component was previously rendered into `container`, this will
   * perform an update on it and only mutate the DOM as necessary to reflect the
   * latest React component.
   *
   * @param {ReactDescriptor} nextDescriptor Component descriptor to render.
   * @param {DOMElement} container DOM element to render into.
   * @param {?function} callback function triggered on completion
   * @return {ReactComponent} Component instance rendered in `container`.
   */
  renderComponent: function(nextDescriptor, container, callback) {
    ("production" !== "development" ? invariant(
      ReactDescriptor.isValidDescriptor(nextDescriptor),
      'renderComponent(): Invalid component descriptor.%s',
      (
        ReactDescriptor.isValidFactory(nextDescriptor) ?
          ' Instead of passing a component class, make sure to instantiate ' +
          'it first by calling it with props.' :
        // Check if it quacks like a descriptor
        typeof nextDescriptor.props !== "undefined" ?
          ' This may be caused by unintentionally loading two independent ' +
          'copies of React.' :
          ''
      )
    ) : invariant(ReactDescriptor.isValidDescriptor(nextDescriptor)));

    var prevComponent = instancesByReactRootID[getReactRootID(container)];

    if (prevComponent) {
      var prevDescriptor = prevComponent._descriptor;
      if (shouldUpdateReactComponent(prevDescriptor, nextDescriptor)) {
        return ReactMount._updateRootComponent(
          prevComponent,
          nextDescriptor,
          container,
          callback
        );
      } else {
        ReactMount.unmountComponentAtNode(container);
      }
    }

    var reactRootElement = getReactRootElementInContainer(container);
    var containerHasReactMarkup =
      reactRootElement && ReactMount.isRenderedByReact(reactRootElement);

    var shouldReuseMarkup = containerHasReactMarkup && !prevComponent;

    var component = ReactMount._renderNewRootComponent(
      nextDescriptor,
      container,
      shouldReuseMarkup
    );
    callback && callback.call(component);
    return component;
  },

  /**
   * Constructs a component instance of `constructor` with `initialProps` and
   * renders it into the supplied `container`.
   *
   * @param {function} constructor React component constructor.
   * @param {?object} props Initial props of the component instance.
   * @param {DOMElement} container DOM element to render into.
   * @return {ReactComponent} Component instance rendered in `container`.
   */
  constructAndRenderComponent: function(constructor, props, container) {
    return ReactMount.renderComponent(constructor(props), container);
  },

  /**
   * Constructs a component instance of `constructor` with `initialProps` and
   * renders it into a container node identified by supplied `id`.
   *
   * @param {function} componentConstructor React component constructor
   * @param {?object} props Initial props of the component instance.
   * @param {string} id ID of the DOM element to render into.
   * @return {ReactComponent} Component instance rendered in the container node.
   */
  constructAndRenderComponentByID: function(constructor, props, id) {
    var domNode = document.getElementById(id);
    ("production" !== "development" ? invariant(
      domNode,
      'Tried to get element with id of "%s" but it is not present on the page.',
      id
    ) : invariant(domNode));
    return ReactMount.constructAndRenderComponent(constructor, props, domNode);
  },

  /**
   * Registers a container node into which React components will be rendered.
   * This also creates the "reactRoot" ID that will be assigned to the element
   * rendered within.
   *
   * @param {DOMElement} container DOM element to register as a container.
   * @return {string} The "reactRoot" ID of elements rendered within.
   */
  registerContainer: function(container) {
    var reactRootID = getReactRootID(container);
    if (reactRootID) {
      // If one exists, make sure it is a valid "reactRoot" ID.
      reactRootID = ReactInstanceHandles.getReactRootIDFromNodeID(reactRootID);
    }
    if (!reactRootID) {
      // No valid "reactRoot" ID found, create one.
      reactRootID = ReactInstanceHandles.createReactRootID();
    }
    containersByReactRootID[reactRootID] = container;
    return reactRootID;
  },

  /**
   * Unmounts and destroys the React component rendered in the `container`.
   *
   * @param {DOMElement} container DOM element containing a React component.
   * @return {boolean} True if a component was found in and unmounted from
   *                   `container`
   */
  unmountComponentAtNode: function(container) {
    // Various parts of our code (such as ReactCompositeComponent's
    // _renderValidatedComponent) assume that calls to render aren't nested;
    // verify that that's the case. (Strictly speaking, unmounting won't cause a
    // render but we still don't expect to be in a render call here.)
    ("production" !== "development" ? warning(
      ReactCurrentOwner.current == null,
      'unmountComponentAtNode(): Render methods should be a pure function of ' +
      'props and state; triggering nested component updates from render is ' +
      'not allowed. If necessary, trigger nested updates in ' +
      'componentDidUpdate.'
    ) : null);

    var reactRootID = getReactRootID(container);
    var component = instancesByReactRootID[reactRootID];
    if (!component) {
      return false;
    }
    ReactMount.unmountComponentFromNode(component, container);
    delete instancesByReactRootID[reactRootID];
    delete containersByReactRootID[reactRootID];
    if ("production" !== "development") {
      delete rootElementsByReactRootID[reactRootID];
    }
    return true;
  },

  /**
   * Unmounts a component and removes it from the DOM.
   *
   * @param {ReactComponent} instance React component instance.
   * @param {DOMElement} container DOM element to unmount from.
   * @final
   * @internal
   * @see {ReactMount.unmountComponentAtNode}
   */
  unmountComponentFromNode: function(instance, container) {
    instance.unmountComponent();

    if (container.nodeType === DOC_NODE_TYPE) {
      container = container.documentElement;
    }

    // http://jsperf.com/emptying-a-node
    while (container.lastChild) {
      container.removeChild(container.lastChild);
    }
  },

  /**
   * Finds the container DOM element that contains React component to which the
   * supplied DOM `id` belongs.
   *
   * @param {string} id The ID of an element rendered by a React component.
   * @return {?DOMElement} DOM element that contains the `id`.
   */
  findReactContainerForID: function(id) {
    var reactRootID = ReactInstanceHandles.getReactRootIDFromNodeID(id);
    var container = containersByReactRootID[reactRootID];

    if ("production" !== "development") {
      var rootElement = rootElementsByReactRootID[reactRootID];
      if (rootElement && rootElement.parentNode !== container) {
        ("production" !== "development" ? invariant(
          // Call internalGetID here because getID calls isValid which calls
          // findReactContainerForID (this function).
          internalGetID(rootElement) === reactRootID,
          'ReactMount: Root element ID differed from reactRootID.'
        ) : invariant(// Call internalGetID here because getID calls isValid which calls
        // findReactContainerForID (this function).
        internalGetID(rootElement) === reactRootID));

        var containerChild = container.firstChild;
        if (containerChild &&
            reactRootID === internalGetID(containerChild)) {
          // If the container has a new child with the same ID as the old
          // root element, then rootElementsByReactRootID[reactRootID] is
          // just stale and needs to be updated. The case that deserves a
          // warning is when the container is empty.
          rootElementsByReactRootID[reactRootID] = containerChild;
        } else {
          console.warn(
            'ReactMount: Root element has been removed from its original ' +
            'container. New container:', rootElement.parentNode
          );
        }
      }
    }

    return container;
  },

  /**
   * Finds an element rendered by React with the supplied ID.
   *
   * @param {string} id ID of a DOM node in the React component.
   * @return {DOMElement} Root DOM node of the React component.
   */
  findReactNodeByID: function(id) {
    var reactRoot = ReactMount.findReactContainerForID(id);
    return ReactMount.findComponentRoot(reactRoot, id);
  },

  /**
   * True if the supplied `node` is rendered by React.
   *
   * @param {*} node DOM Element to check.
   * @return {boolean} True if the DOM Element appears to be rendered by React.
   * @internal
   */
  isRenderedByReact: function(node) {
    if (node.nodeType !== 1) {
      // Not a DOMElement, therefore not a React component
      return false;
    }
    var id = ReactMount.getID(node);
    return id ? id.charAt(0) === SEPARATOR : false;
  },

  /**
   * Traverses up the ancestors of the supplied node to find a node that is a
   * DOM representation of a React component.
   *
   * @param {*} node
   * @return {?DOMEventTarget}
   * @internal
   */
  getFirstReactDOM: function(node) {
    var current = node;
    while (current && current.parentNode !== current) {
      if (ReactMount.isRenderedByReact(current)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  },

  /**
   * Finds a node with the supplied `targetID` inside of the supplied
   * `ancestorNode`.  Exploits the ID naming scheme to perform the search
   * quickly.
   *
   * @param {DOMEventTarget} ancestorNode Search from this root.
   * @pararm {string} targetID ID of the DOM representation of the component.
   * @return {DOMEventTarget} DOM node with the supplied `targetID`.
   * @internal
   */
  findComponentRoot: function(ancestorNode, targetID) {
    var firstChildren = findComponentRootReusableArray;
    var childIndex = 0;

    var deepestAncestor = findDeepestCachedAncestor(targetID) || ancestorNode;

    firstChildren[0] = deepestAncestor.firstChild;
    firstChildren.length = 1;

    while (childIndex < firstChildren.length) {
      var child = firstChildren[childIndex++];
      var targetChild;

      while (child) {
        var childID = ReactMount.getID(child);
        if (childID) {
          // Even if we find the node we're looking for, we finish looping
          // through its siblings to ensure they're cached so that we don't have
          // to revisit this node again. Otherwise, we make n^2 calls to getID
          // when visiting the many children of a single node in order.

          if (targetID === childID) {
            targetChild = child;
          } else if (ReactInstanceHandles.isAncestorIDOf(childID, targetID)) {
            // If we find a child whose ID is an ancestor of the given ID,
            // then we can be sure that we only want to search the subtree
            // rooted at this child, so we can throw out the rest of the
            // search state.
            firstChildren.length = childIndex = 0;
            firstChildren.push(child.firstChild);
          }

        } else {
          // If this child had no ID, then there's a chance that it was
          // injected automatically by the browser, as when a `<table>`
          // element sprouts an extra `<tbody>` child as a side effect of
          // `.innerHTML` parsing. Optimistically continue down this
          // branch, but not before examining the other siblings.
          firstChildren.push(child.firstChild);
        }

        child = child.nextSibling;
      }

      if (targetChild) {
        // Emptying firstChildren/findComponentRootReusableArray is
        // not necessary for correctness, but it helps the GC reclaim
        // any nodes that were left at the end of the search.
        firstChildren.length = 0;

        return targetChild;
      }
    }

    firstChildren.length = 0;

    ("production" !== "development" ? invariant(
      false,
      'findComponentRoot(..., %s): Unable to find element. This probably ' +
      'means the DOM was unexpectedly mutated (e.g., by the browser), ' +
      'usually due to forgetting a <tbody> when using tables, nesting <p> ' +
      'or <a> tags, or using non-SVG elements in an <svg> parent. Try ' +
      'inspecting the child nodes of the element with React ID `%s`.',
      targetID,
      ReactMount.getID(ancestorNode)
    ) : invariant(false));
  },


  /**
   * React ID utilities.
   */

  getReactRootID: getReactRootID,

  getID: getID,

  setID: setID,

  getNode: getNode,

  purgeID: purgeID
};

module.exports = ReactMount;

},{"./DOMProperty":10,"./ReactBrowserEventEmitter":29,"./ReactCurrentOwner":35,"./ReactDescriptor":51,"./ReactInstanceHandles":59,"./ReactPerf":65,"./containsNode":96,"./getReactRootElementInContainer":114,"./instantiateReactComponent":119,"./invariant":120,"./shouldUpdateReactComponent":140,"./warning":143}],62:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactMultiChild
 * @typechecks static-only
 */

"use strict";

var ReactComponent = _dereq_("./ReactComponent");
var ReactMultiChildUpdateTypes = _dereq_("./ReactMultiChildUpdateTypes");

var flattenChildren = _dereq_("./flattenChildren");
var instantiateReactComponent = _dereq_("./instantiateReactComponent");
var shouldUpdateReactComponent = _dereq_("./shouldUpdateReactComponent");

/**
 * Updating children of a component may trigger recursive updates. The depth is
 * used to batch recursive updates to render markup more efficiently.
 *
 * @type {number}
 * @private
 */
var updateDepth = 0;

/**
 * Queue of update configuration objects.
 *
 * Each object has a `type` property that is in `ReactMultiChildUpdateTypes`.
 *
 * @type {array<object>}
 * @private
 */
var updateQueue = [];

/**
 * Queue of markup to be rendered.
 *
 * @type {array<string>}
 * @private
 */
var markupQueue = [];

/**
 * Enqueues markup to be rendered and inserted at a supplied index.
 *
 * @param {string} parentID ID of the parent component.
 * @param {string} markup Markup that renders into an element.
 * @param {number} toIndex Destination index.
 * @private
 */
function enqueueMarkup(parentID, markup, toIndex) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.INSERT_MARKUP,
    markupIndex: markupQueue.push(markup) - 1,
    textContent: null,
    fromIndex: null,
    toIndex: toIndex
  });
}

/**
 * Enqueues moving an existing element to another index.
 *
 * @param {string} parentID ID of the parent component.
 * @param {number} fromIndex Source index of the existing element.
 * @param {number} toIndex Destination index of the element.
 * @private
 */
function enqueueMove(parentID, fromIndex, toIndex) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.MOVE_EXISTING,
    markupIndex: null,
    textContent: null,
    fromIndex: fromIndex,
    toIndex: toIndex
  });
}

/**
 * Enqueues removing an element at an index.
 *
 * @param {string} parentID ID of the parent component.
 * @param {number} fromIndex Index of the element to remove.
 * @private
 */
function enqueueRemove(parentID, fromIndex) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.REMOVE_NODE,
    markupIndex: null,
    textContent: null,
    fromIndex: fromIndex,
    toIndex: null
  });
}

/**
 * Enqueues setting the text content.
 *
 * @param {string} parentID ID of the parent component.
 * @param {string} textContent Text content to set.
 * @private
 */
function enqueueTextContent(parentID, textContent) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.TEXT_CONTENT,
    markupIndex: null,
    textContent: textContent,
    fromIndex: null,
    toIndex: null
  });
}

/**
 * Processes any enqueued updates.
 *
 * @private
 */
function processQueue() {
  if (updateQueue.length) {
    ReactComponent.BackendIDOperations.dangerouslyProcessChildrenUpdates(
      updateQueue,
      markupQueue
    );
    clearQueue();
  }
}

/**
 * Clears any enqueued updates.
 *
 * @private
 */
function clearQueue() {
  updateQueue.length = 0;
  markupQueue.length = 0;
}

/**
 * ReactMultiChild are capable of reconciling multiple children.
 *
 * @class ReactMultiChild
 * @internal
 */
var ReactMultiChild = {

  /**
   * Provides common functionality for components that must reconcile multiple
   * children. This is used by `ReactDOMComponent` to mount, update, and
   * unmount child components.
   *
   * @lends {ReactMultiChild.prototype}
   */
  Mixin: {

    /**
     * Generates a "mount image" for each of the supplied children. In the case
     * of `ReactDOMComponent`, a mount image is a string of markup.
     *
     * @param {?object} nestedChildren Nested child maps.
     * @return {array} An array of mounted representations.
     * @internal
     */
    mountChildren: function(nestedChildren, transaction) {
      var children = flattenChildren(nestedChildren);
      var mountImages = [];
      var index = 0;
      this._renderedChildren = children;
      for (var name in children) {
        var child = children[name];
        if (children.hasOwnProperty(name)) {
          // The rendered children must be turned into instances as they're
          // mounted.
          var childInstance = instantiateReactComponent(child);
          children[name] = childInstance;
          // Inlined for performance, see `ReactInstanceHandles.createReactID`.
          var rootID = this._rootNodeID + name;
          var mountImage = childInstance.mountComponent(
            rootID,
            transaction,
            this._mountDepth + 1
          );
          childInstance._mountIndex = index;
          mountImages.push(mountImage);
          index++;
        }
      }
      return mountImages;
    },

    /**
     * Replaces any rendered children with a text content string.
     *
     * @param {string} nextContent String of content.
     * @internal
     */
    updateTextContent: function(nextContent) {
      updateDepth++;
      var errorThrown = true;
      try {
        var prevChildren = this._renderedChildren;
        // Remove any rendered children.
        for (var name in prevChildren) {
          if (prevChildren.hasOwnProperty(name)) {
            this._unmountChildByName(prevChildren[name], name);
          }
        }
        // Set new text content.
        this.setTextContent(nextContent);
        errorThrown = false;
      } finally {
        updateDepth--;
        if (!updateDepth) {
          errorThrown ? clearQueue() : processQueue();
        }
      }
    },

    /**
     * Updates the rendered children with new children.
     *
     * @param {?object} nextNestedChildren Nested child maps.
     * @param {ReactReconcileTransaction} transaction
     * @internal
     */
    updateChildren: function(nextNestedChildren, transaction) {
      updateDepth++;
      var errorThrown = true;
      try {
        this._updateChildren(nextNestedChildren, transaction);
        errorThrown = false;
      } finally {
        updateDepth--;
        if (!updateDepth) {
          errorThrown ? clearQueue() : processQueue();
        }
      }
    },

    /**
     * Improve performance by isolating this hot code path from the try/catch
     * block in `updateChildren`.
     *
     * @param {?object} nextNestedChildren Nested child maps.
     * @param {ReactReconcileTransaction} transaction
     * @final
     * @protected
     */
    _updateChildren: function(nextNestedChildren, transaction) {
      var nextChildren = flattenChildren(nextNestedChildren);
      var prevChildren = this._renderedChildren;
      if (!nextChildren && !prevChildren) {
        return;
      }
      var name;
      // `nextIndex` will increment for each child in `nextChildren`, but
      // `lastIndex` will be the last index visited in `prevChildren`.
      var lastIndex = 0;
      var nextIndex = 0;
      for (name in nextChildren) {
        if (!nextChildren.hasOwnProperty(name)) {
          continue;
        }
        var prevChild = prevChildren && prevChildren[name];
        var prevDescriptor = prevChild && prevChild._descriptor;
        var nextDescriptor = nextChildren[name];
        if (shouldUpdateReactComponent(prevDescriptor, nextDescriptor)) {
          this.moveChild(prevChild, nextIndex, lastIndex);
          lastIndex = Math.max(prevChild._mountIndex, lastIndex);
          prevChild.receiveComponent(nextDescriptor, transaction);
          prevChild._mountIndex = nextIndex;
        } else {
          if (prevChild) {
            // Update `lastIndex` before `_mountIndex` gets unset by unmounting.
            lastIndex = Math.max(prevChild._mountIndex, lastIndex);
            this._unmountChildByName(prevChild, name);
          }
          // The child must be instantiated before it's mounted.
          var nextChildInstance = instantiateReactComponent(nextDescriptor);
          this._mountChildByNameAtIndex(
            nextChildInstance, name, nextIndex, transaction
          );
        }
        nextIndex++;
      }
      // Remove children that are no longer present.
      for (name in prevChildren) {
        if (prevChildren.hasOwnProperty(name) &&
            !(nextChildren && nextChildren[name])) {
          this._unmountChildByName(prevChildren[name], name);
        }
      }
    },

    /**
     * Unmounts all rendered children. This should be used to clean up children
     * when this component is unmounted.
     *
     * @internal
     */
    unmountChildren: function() {
      var renderedChildren = this._renderedChildren;
      for (var name in renderedChildren) {
        var renderedChild = renderedChildren[name];
        // TODO: When is this not true?
        if (renderedChild.unmountComponent) {
          renderedChild.unmountComponent();
        }
      }
      this._renderedChildren = null;
    },

    /**
     * Moves a child component to the supplied index.
     *
     * @param {ReactComponent} child Component to move.
     * @param {number} toIndex Destination index of the element.
     * @param {number} lastIndex Last index visited of the siblings of `child`.
     * @protected
     */
    moveChild: function(child, toIndex, lastIndex) {
      // If the index of `child` is less than `lastIndex`, then it needs to
      // be moved. Otherwise, we do not need to move it because a child will be
      // inserted or moved before `child`.
      if (child._mountIndex < lastIndex) {
        enqueueMove(this._rootNodeID, child._mountIndex, toIndex);
      }
    },

    /**
     * Creates a child component.
     *
     * @param {ReactComponent} child Component to create.
     * @param {string} mountImage Markup to insert.
     * @protected
     */
    createChild: function(child, mountImage) {
      enqueueMarkup(this._rootNodeID, mountImage, child._mountIndex);
    },

    /**
     * Removes a child component.
     *
     * @param {ReactComponent} child Child to remove.
     * @protected
     */
    removeChild: function(child) {
      enqueueRemove(this._rootNodeID, child._mountIndex);
    },

    /**
     * Sets this text content string.
     *
     * @param {string} textContent Text content to set.
     * @protected
     */
    setTextContent: function(textContent) {
      enqueueTextContent(this._rootNodeID, textContent);
    },

    /**
     * Mounts a child with the supplied name.
     *
     * NOTE: This is part of `updateChildren` and is here for readability.
     *
     * @param {ReactComponent} child Component to mount.
     * @param {string} name Name of the child.
     * @param {number} index Index at which to insert the child.
     * @param {ReactReconcileTransaction} transaction
     * @private
     */
    _mountChildByNameAtIndex: function(child, name, index, transaction) {
      // Inlined for performance, see `ReactInstanceHandles.createReactID`.
      var rootID = this._rootNodeID + name;
      var mountImage = child.mountComponent(
        rootID,
        transaction,
        this._mountDepth + 1
      );
      child._mountIndex = index;
      this.createChild(child, mountImage);
      this._renderedChildren = this._renderedChildren || {};
      this._renderedChildren[name] = child;
    },

    /**
     * Unmounts a rendered child by name.
     *
     * NOTE: This is part of `updateChildren` and is here for readability.
     *
     * @param {ReactComponent} child Component to unmount.
     * @param {string} name Name of the child in `this._renderedChildren`.
     * @private
     */
    _unmountChildByName: function(child, name) {
      this.removeChild(child);
      child._mountIndex = null;
      child.unmountComponent();
      delete this._renderedChildren[name];
    }

  }

};

module.exports = ReactMultiChild;

},{"./ReactComponent":31,"./ReactMultiChildUpdateTypes":63,"./flattenChildren":105,"./instantiateReactComponent":119,"./shouldUpdateReactComponent":140}],63:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactMultiChildUpdateTypes
 */

"use strict";

var keyMirror = _dereq_("./keyMirror");

/**
 * When a component's children are updated, a series of update configuration
 * objects are created in order to batch and serialize the required changes.
 *
 * Enumerates all the possible types of update configurations.
 *
 * @internal
 */
var ReactMultiChildUpdateTypes = keyMirror({
  INSERT_MARKUP: null,
  MOVE_EXISTING: null,
  REMOVE_NODE: null,
  TEXT_CONTENT: null
});

module.exports = ReactMultiChildUpdateTypes;

},{"./keyMirror":126}],64:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactOwner
 */

"use strict";

var emptyObject = _dereq_("./emptyObject");
var invariant = _dereq_("./invariant");

/**
 * ReactOwners are capable of storing references to owned components.
 *
 * All components are capable of //being// referenced by owner components, but
 * only ReactOwner components are capable of //referencing// owned components.
 * The named reference is known as a "ref".
 *
 * Refs are available when mounted and updated during reconciliation.
 *
 *   var MyComponent = React.createClass({
 *     render: function() {
 *       return (
 *         <div onClick={this.handleClick}>
 *           <CustomComponent ref="custom" />
 *         </div>
 *       );
 *     },
 *     handleClick: function() {
 *       this.refs.custom.handleClick();
 *     },
 *     componentDidMount: function() {
 *       this.refs.custom.initialize();
 *     }
 *   });
 *
 * Refs should rarely be used. When refs are used, they should only be done to
 * control data that is not handled by React's data flow.
 *
 * @class ReactOwner
 */
var ReactOwner = {

  /**
   * @param {?object} object
   * @return {boolean} True if `object` is a valid owner.
   * @final
   */
  isValidOwner: function(object) {
    return !!(
      object &&
      typeof object.attachRef === 'function' &&
      typeof object.detachRef === 'function'
    );
  },

  /**
   * Adds a component by ref to an owner component.
   *
   * @param {ReactComponent} component Component to reference.
   * @param {string} ref Name by which to refer to the component.
   * @param {ReactOwner} owner Component on which to record the ref.
   * @final
   * @internal
   */
  addComponentAsRefTo: function(component, ref, owner) {
    ("production" !== "development" ? invariant(
      ReactOwner.isValidOwner(owner),
      'addComponentAsRefTo(...): Only a ReactOwner can have refs. This ' +
      'usually means that you\'re trying to add a ref to a component that ' +
      'doesn\'t have an owner (that is, was not created inside of another ' +
      'component\'s `render` method). Try rendering this component inside of ' +
      'a new top-level component which will hold the ref.'
    ) : invariant(ReactOwner.isValidOwner(owner)));
    owner.attachRef(ref, component);
  },

  /**
   * Removes a component by ref from an owner component.
   *
   * @param {ReactComponent} component Component to dereference.
   * @param {string} ref Name of the ref to remove.
   * @param {ReactOwner} owner Component on which the ref is recorded.
   * @final
   * @internal
   */
  removeComponentAsRefFrom: function(component, ref, owner) {
    ("production" !== "development" ? invariant(
      ReactOwner.isValidOwner(owner),
      'removeComponentAsRefFrom(...): Only a ReactOwner can have refs. This ' +
      'usually means that you\'re trying to remove a ref to a component that ' +
      'doesn\'t have an owner (that is, was not created inside of another ' +
      'component\'s `render` method). Try rendering this component inside of ' +
      'a new top-level component which will hold the ref.'
    ) : invariant(ReactOwner.isValidOwner(owner)));
    // Check that `component` is still the current ref because we do not want to
    // detach the ref if another component stole it.
    if (owner.refs[ref] === component) {
      owner.detachRef(ref);
    }
  },

  /**
   * A ReactComponent must mix this in to have refs.
   *
   * @lends {ReactOwner.prototype}
   */
  Mixin: {

    construct: function() {
      this.refs = emptyObject;
    },

    /**
     * Lazily allocates the refs object and stores `component` as `ref`.
     *
     * @param {string} ref Reference name.
     * @param {component} component Component to store as `ref`.
     * @final
     * @private
     */
    attachRef: function(ref, component) {
      ("production" !== "development" ? invariant(
        component.isOwnedBy(this),
        'attachRef(%s, ...): Only a component\'s owner can store a ref to it.',
        ref
      ) : invariant(component.isOwnedBy(this)));
      var refs = this.refs === emptyObject ? (this.refs = {}) : this.refs;
      refs[ref] = component;
    },

    /**
     * Detaches a reference name.
     *
     * @param {string} ref Name to dereference.
     * @final
     * @private
     */
    detachRef: function(ref) {
      delete this.refs[ref];
    }

  }

};

module.exports = ReactOwner;

},{"./emptyObject":103,"./invariant":120}],65:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactPerf
 * @typechecks static-only
 */

"use strict";

/**
 * ReactPerf is a general AOP system designed to measure performance. This
 * module only has the hooks: see ReactDefaultPerf for the analysis tool.
 */
var ReactPerf = {
  /**
   * Boolean to enable/disable measurement. Set to false by default to prevent
   * accidental logging and perf loss.
   */
  enableMeasure: false,

  /**
   * Holds onto the measure function in use. By default, don't measure
   * anything, but we'll override this if we inject a measure function.
   */
  storedMeasure: _noMeasure,

  /**
   * Use this to wrap methods you want to measure. Zero overhead in production.
   *
   * @param {string} objName
   * @param {string} fnName
   * @param {function} func
   * @return {function}
   */
  measure: function(objName, fnName, func) {
    if ("production" !== "development") {
      var measuredFunc = null;
      return function() {
        if (ReactPerf.enableMeasure) {
          if (!measuredFunc) {
            measuredFunc = ReactPerf.storedMeasure(objName, fnName, func);
          }
          return measuredFunc.apply(this, arguments);
        }
        return func.apply(this, arguments);
      };
    }
    return func;
  },

  injection: {
    /**
     * @param {function} measure
     */
    injectMeasure: function(measure) {
      ReactPerf.storedMeasure = measure;
    }
  }
};

/**
 * Simply passes through the measured function, without measuring it.
 *
 * @param {string} objName
 * @param {string} fnName
 * @param {function} func
 * @return {function}
 */
function _noMeasure(objName, fnName, func) {
  return func;
}

module.exports = ReactPerf;

},{}],66:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactPropTransferer
 */

"use strict";

var emptyFunction = _dereq_("./emptyFunction");
var invariant = _dereq_("./invariant");
var joinClasses = _dereq_("./joinClasses");
var merge = _dereq_("./merge");

/**
 * Creates a transfer strategy that will merge prop values using the supplied
 * `mergeStrategy`. If a prop was previously unset, this just sets it.
 *
 * @param {function} mergeStrategy
 * @return {function}
 */
function createTransferStrategy(mergeStrategy) {
  return function(props, key, value) {
    if (!props.hasOwnProperty(key)) {
      props[key] = value;
    } else {
      props[key] = mergeStrategy(props[key], value);
    }
  };
}

var transferStrategyMerge = createTransferStrategy(function(a, b) {
  // `merge` overrides the first object's (`props[key]` above) keys using the
  // second object's (`value`) keys. An object's style's existing `propA` would
  // get overridden. Flip the order here.
  return merge(b, a);
});

/**
 * Transfer strategies dictate how props are transferred by `transferPropsTo`.
 * NOTE: if you add any more exceptions to this list you should be sure to
 * update `cloneWithProps()` accordingly.
 */
var TransferStrategies = {
  /**
   * Never transfer `children`.
   */
  children: emptyFunction,
  /**
   * Transfer the `className` prop by merging them.
   */
  className: createTransferStrategy(joinClasses),
  /**
   * Never transfer the `key` prop.
   */
  key: emptyFunction,
  /**
   * Never transfer the `ref` prop.
   */
  ref: emptyFunction,
  /**
   * Transfer the `style` prop (which is an object) by merging them.
   */
  style: transferStrategyMerge
};

/**
 * Mutates the first argument by transferring the properties from the second
 * argument.
 *
 * @param {object} props
 * @param {object} newProps
 * @return {object}
 */
function transferInto(props, newProps) {
  for (var thisKey in newProps) {
    if (!newProps.hasOwnProperty(thisKey)) {
      continue;
    }

    var transferStrategy = TransferStrategies[thisKey];

    if (transferStrategy && TransferStrategies.hasOwnProperty(thisKey)) {
      transferStrategy(props, thisKey, newProps[thisKey]);
    } else if (!props.hasOwnProperty(thisKey)) {
      props[thisKey] = newProps[thisKey];
    }
  }
  return props;
}

/**
 * ReactPropTransferer are capable of transferring props to another component
 * using a `transferPropsTo` method.
 *
 * @class ReactPropTransferer
 */
var ReactPropTransferer = {

  TransferStrategies: TransferStrategies,

  /**
   * Merge two props objects using TransferStrategies.
   *
   * @param {object} oldProps original props (they take precedence)
   * @param {object} newProps new props to merge in
   * @return {object} a new object containing both sets of props merged.
   */
  mergeProps: function(oldProps, newProps) {
    return transferInto(merge(oldProps), newProps);
  },

  /**
   * @lends {ReactPropTransferer.prototype}
   */
  Mixin: {

    /**
     * Transfer props from this component to a target component.
     *
     * Props that do not have an explicit transfer strategy will be transferred
     * only if the target component does not already have the prop set.
     *
     * This is usually used to pass down props to a returned root component.
     *
     * @param {ReactDescriptor} descriptor Component receiving the properties.
     * @return {ReactDescriptor} The supplied `component`.
     * @final
     * @protected
     */
    transferPropsTo: function(descriptor) {
      ("production" !== "development" ? invariant(
        descriptor._owner === this,
        '%s: You can\'t call transferPropsTo() on a component that you ' +
        'don\'t own, %s. This usually means you are calling ' +
        'transferPropsTo() on a component passed in as props or children.',
        this.constructor.displayName,
        descriptor.type.displayName
      ) : invariant(descriptor._owner === this));

      // Because descriptors are immutable we have to merge into the existing
      // props object rather than clone it.
      transferInto(descriptor.props, this.props);

      return descriptor;
    }

  }
};

module.exports = ReactPropTransferer;

},{"./emptyFunction":102,"./invariant":120,"./joinClasses":125,"./merge":130}],67:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactPropTypeLocationNames
 */

"use strict";

var ReactPropTypeLocationNames = {};

if ("production" !== "development") {
  ReactPropTypeLocationNames = {
    prop: 'prop',
    context: 'context',
    childContext: 'child context'
  };
}

module.exports = ReactPropTypeLocationNames;

},{}],68:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactPropTypeLocations
 */

"use strict";

var keyMirror = _dereq_("./keyMirror");

var ReactPropTypeLocations = keyMirror({
  prop: null,
  context: null,
  childContext: null
});

module.exports = ReactPropTypeLocations;

},{"./keyMirror":126}],69:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactPropTypes
 */

"use strict";

var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactPropTypeLocationNames = _dereq_("./ReactPropTypeLocationNames");

var emptyFunction = _dereq_("./emptyFunction");

/**
 * Collection of methods that allow declaration and validation of props that are
 * supplied to React components. Example usage:
 *
 *   var Props = require('ReactPropTypes');
 *   var MyArticle = React.createClass({
 *     propTypes: {
 *       // An optional string prop named "description".
 *       description: Props.string,
 *
 *       // A required enum prop named "category".
 *       category: Props.oneOf(['News','Photos']).isRequired,
 *
 *       // A prop named "dialog" that requires an instance of Dialog.
 *       dialog: Props.instanceOf(Dialog).isRequired
 *     },
 *     render: function() { ... }
 *   });
 *
 * A more formal specification of how these methods are used:
 *
 *   type := array|bool|func|object|number|string|oneOf([...])|instanceOf(...)
 *   decl := ReactPropTypes.{type}(.isRequired)?
 *
 * Each and every declaration produces a function with the same signature. This
 * allows the creation of custom validation functions. For example:
 *
 *  var MyLink = React.createClass({
 *    propTypes: {
 *      // An optional string or URI prop named "href".
 *      href: function(props, propName, componentName) {
 *        var propValue = props[propName];
 *        if (propValue != null && typeof propValue !== 'string' &&
 *            !(propValue instanceof URI)) {
 *          return new Error(
 *            'Expected a string or an URI for ' + propName + ' in ' +
 *            componentName
 *          );
 *        }
 *      }
 *    },
 *    render: function() {...}
 *  });
 *
 * @internal
 */

var ANONYMOUS = '<<anonymous>>';

var ReactPropTypes = {
  array: createPrimitiveTypeChecker('array'),
  bool: createPrimitiveTypeChecker('boolean'),
  func: createPrimitiveTypeChecker('function'),
  number: createPrimitiveTypeChecker('number'),
  object: createPrimitiveTypeChecker('object'),
  string: createPrimitiveTypeChecker('string'),

  any: createAnyTypeChecker(),
  arrayOf: createArrayOfTypeChecker,
  component: createComponentTypeChecker(),
  instanceOf: createInstanceTypeChecker,
  objectOf: createObjectOfTypeChecker,
  oneOf: createEnumTypeChecker,
  oneOfType: createUnionTypeChecker,
  renderable: createRenderableTypeChecker(),
  shape: createShapeTypeChecker
};

function createChainableTypeChecker(validate) {
  function checkType(isRequired, props, propName, componentName, location) {
    componentName = componentName || ANONYMOUS;
    if (props[propName] == null) {
      var locationName = ReactPropTypeLocationNames[location];
      if (isRequired) {
        return new Error(
          ("Required " + locationName + " `" + propName + "` was not specified in ")+
          ("`" + componentName + "`.")
        );
      }
    } else {
      return validate(props, propName, componentName, location);
    }
  }

  var chainedCheckType = checkType.bind(null, false);
  chainedCheckType.isRequired = checkType.bind(null, true);

  return chainedCheckType;
}

function createPrimitiveTypeChecker(expectedType) {
  function validate(props, propName, componentName, location) {
    var propValue = props[propName];
    var propType = getPropType(propValue);
    if (propType !== expectedType) {
      var locationName = ReactPropTypeLocationNames[location];
      // `propValue` being instance of, say, date/regexp, pass the 'object'
      // check, but we can offer a more precise error message here rather than
      // 'of type `object`'.
      var preciseType = getPreciseType(propValue);

      return new Error(
        ("Invalid " + locationName + " `" + propName + "` of type `" + preciseType + "` ") +
        ("supplied to `" + componentName + "`, expected `" + expectedType + "`.")
      );
    }
  }
  return createChainableTypeChecker(validate);
}

function createAnyTypeChecker() {
  return createChainableTypeChecker(emptyFunction.thatReturns());
}

function createArrayOfTypeChecker(typeChecker) {
  function validate(props, propName, componentName, location) {
    var propValue = props[propName];
    if (!Array.isArray(propValue)) {
      var locationName = ReactPropTypeLocationNames[location];
      var propType = getPropType(propValue);
      return new Error(
        ("Invalid " + locationName + " `" + propName + "` of type ") +
        ("`" + propType + "` supplied to `" + componentName + "`, expected an array.")
      );
    }
    for (var i = 0; i < propValue.length; i++) {
      var error = typeChecker(propValue, i, componentName, location);
      if (error instanceof Error) {
        return error;
      }
    }
  }
  return createChainableTypeChecker(validate);
}

function createComponentTypeChecker() {
  function validate(props, propName, componentName, location) {
    if (!ReactDescriptor.isValidDescriptor(props[propName])) {
      var locationName = ReactPropTypeLocationNames[location];
      return new Error(
        ("Invalid " + locationName + " `" + propName + "` supplied to ") +
        ("`" + componentName + "`, expected a React component.")
      );
    }
  }
  return createChainableTypeChecker(validate);
}

function createInstanceTypeChecker(expectedClass) {
  function validate(props, propName, componentName, location) {
    if (!(props[propName] instanceof expectedClass)) {
      var locationName = ReactPropTypeLocationNames[location];
      var expectedClassName = expectedClass.name || ANONYMOUS;
      return new Error(
        ("Invalid " + locationName + " `" + propName + "` supplied to ") +
        ("`" + componentName + "`, expected instance of `" + expectedClassName + "`.")
      );
    }
  }
  return createChainableTypeChecker(validate);
}

function createEnumTypeChecker(expectedValues) {
  function validate(props, propName, componentName, location) {
    var propValue = props[propName];
    for (var i = 0; i < expectedValues.length; i++) {
      if (propValue === expectedValues[i]) {
        return;
      }
    }

    var locationName = ReactPropTypeLocationNames[location];
    var valuesString = JSON.stringify(expectedValues);
    return new Error(
      ("Invalid " + locationName + " `" + propName + "` of value `" + propValue + "` ") +
      ("supplied to `" + componentName + "`, expected one of " + valuesString + ".")
    );
  }
  return createChainableTypeChecker(validate);
}

function createObjectOfTypeChecker(typeChecker) {
  function validate(props, propName, componentName, location) {
    var propValue = props[propName];
    var propType = getPropType(propValue);
    if (propType !== 'object') {
      var locationName = ReactPropTypeLocationNames[location];
      return new Error(
        ("Invalid " + locationName + " `" + propName + "` of type ") +
        ("`" + propType + "` supplied to `" + componentName + "`, expected an object.")
      );
    }
    for (var key in propValue) {
      if (propValue.hasOwnProperty(key)) {
        var error = typeChecker(propValue, key, componentName, location);
        if (error instanceof Error) {
          return error;
        }
      }
    }
  }
  return createChainableTypeChecker(validate);
}

function createUnionTypeChecker(arrayOfTypeCheckers) {
  function validate(props, propName, componentName, location) {
    for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
      var checker = arrayOfTypeCheckers[i];
      if (checker(props, propName, componentName, location) == null) {
        return;
      }
    }

    var locationName = ReactPropTypeLocationNames[location];
    return new Error(
      ("Invalid " + locationName + " `" + propName + "` supplied to ") +
      ("`" + componentName + "`.")
    );
  }
  return createChainableTypeChecker(validate);
}

function createRenderableTypeChecker() {
  function validate(props, propName, componentName, location) {
    if (!isRenderable(props[propName])) {
      var locationName = ReactPropTypeLocationNames[location];
      return new Error(
        ("Invalid " + locationName + " `" + propName + "` supplied to ") +
        ("`" + componentName + "`, expected a renderable prop.")
      );
    }
  }
  return createChainableTypeChecker(validate);
}

function createShapeTypeChecker(shapeTypes) {
  function validate(props, propName, componentName, location) {
    var propValue = props[propName];
    var propType = getPropType(propValue);
    if (propType !== 'object') {
      var locationName = ReactPropTypeLocationNames[location];
      return new Error(
        ("Invalid " + locationName + " `" + propName + "` of type `" + propType + "` ") +
        ("supplied to `" + componentName + "`, expected `object`.")
      );
    }
    for (var key in shapeTypes) {
      var checker = shapeTypes[key];
      if (!checker) {
        continue;
      }
      var error = checker(propValue, key, componentName, location);
      if (error) {
        return error;
      }
    }
  }
  return createChainableTypeChecker(validate, 'expected `object`');
}

function isRenderable(propValue) {
  switch(typeof propValue) {
    // TODO: this was probably written with the assumption that we're not
    // returning `this.props.component` directly from `render`. This is
    // currently not supported but we should, to make it consistent.
    case 'number':
    case 'string':
      return true;
    case 'boolean':
      return !propValue;
    case 'object':
      if (Array.isArray(propValue)) {
        return propValue.every(isRenderable);
      }
      if (ReactDescriptor.isValidDescriptor(propValue)) {
        return true;
      }
      for (var k in propValue) {
        if (!isRenderable(propValue[k])) {
          return false;
        }
      }
      return true;
    default:
      return false;
  }
}

// Equivalent of `typeof` but with special handling for array and regexp.
function getPropType(propValue) {
  var propType = typeof propValue;
  if (Array.isArray(propValue)) {
    return 'array';
  }
  if (propValue instanceof RegExp) {
    // Old webkits (at least until Android 4.0) return 'function' rather than
    // 'object' for typeof a RegExp. We'll normalize this here so that /bla/
    // passes PropTypes.object.
    return 'object';
  }
  return propType;
}

// This handles more types than `getPropType`. Only used for error messages.
// See `createPrimitiveTypeChecker`.
function getPreciseType(propValue) {
  var propType = getPropType(propValue);
  if (propType === 'object') {
    if (propValue instanceof Date) {
      return 'date';
    } else if (propValue instanceof RegExp) {
      return 'regexp';
    }
  }
  return propType;
}

module.exports = ReactPropTypes;

},{"./ReactDescriptor":51,"./ReactPropTypeLocationNames":67,"./emptyFunction":102}],70:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactPutListenerQueue
 */

"use strict";

var PooledClass = _dereq_("./PooledClass");
var ReactBrowserEventEmitter = _dereq_("./ReactBrowserEventEmitter");

var mixInto = _dereq_("./mixInto");

function ReactPutListenerQueue() {
  this.listenersToPut = [];
}

mixInto(ReactPutListenerQueue, {
  enqueuePutListener: function(rootNodeID, propKey, propValue) {
    this.listenersToPut.push({
      rootNodeID: rootNodeID,
      propKey: propKey,
      propValue: propValue
    });
  },

  putListeners: function() {
    for (var i = 0; i < this.listenersToPut.length; i++) {
      var listenerToPut = this.listenersToPut[i];
      ReactBrowserEventEmitter.putListener(
        listenerToPut.rootNodeID,
        listenerToPut.propKey,
        listenerToPut.propValue
      );
    }
  },

  reset: function() {
    this.listenersToPut.length = 0;
  },

  destructor: function() {
    this.reset();
  }
});

PooledClass.addPoolingTo(ReactPutListenerQueue);

module.exports = ReactPutListenerQueue;

},{"./PooledClass":26,"./ReactBrowserEventEmitter":29,"./mixInto":133}],71:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactReconcileTransaction
 * @typechecks static-only
 */

"use strict";

var CallbackQueue = _dereq_("./CallbackQueue");
var PooledClass = _dereq_("./PooledClass");
var ReactBrowserEventEmitter = _dereq_("./ReactBrowserEventEmitter");
var ReactInputSelection = _dereq_("./ReactInputSelection");
var ReactPutListenerQueue = _dereq_("./ReactPutListenerQueue");
var Transaction = _dereq_("./Transaction");

var mixInto = _dereq_("./mixInto");

/**
 * Ensures that, when possible, the selection range (currently selected text
 * input) is not disturbed by performing the transaction.
 */
var SELECTION_RESTORATION = {
  /**
   * @return {Selection} Selection information.
   */
  initialize: ReactInputSelection.getSelectionInformation,
  /**
   * @param {Selection} sel Selection information returned from `initialize`.
   */
  close: ReactInputSelection.restoreSelection
};

/**
 * Suppresses events (blur/focus) that could be inadvertently dispatched due to
 * high level DOM manipulations (like temporarily removing a text input from the
 * DOM).
 */
var EVENT_SUPPRESSION = {
  /**
   * @return {boolean} The enabled status of `ReactBrowserEventEmitter` before
   * the reconciliation.
   */
  initialize: function() {
    var currentlyEnabled = ReactBrowserEventEmitter.isEnabled();
    ReactBrowserEventEmitter.setEnabled(false);
    return currentlyEnabled;
  },

  /**
   * @param {boolean} previouslyEnabled Enabled status of
   *   `ReactBrowserEventEmitter` before the reconciliation occured. `close`
   *   restores the previous value.
   */
  close: function(previouslyEnabled) {
    ReactBrowserEventEmitter.setEnabled(previouslyEnabled);
  }
};

/**
 * Provides a queue for collecting `componentDidMount` and
 * `componentDidUpdate` callbacks during the the transaction.
 */
var ON_DOM_READY_QUEUEING = {
  /**
   * Initializes the internal `onDOMReady` queue.
   */
  initialize: function() {
    this.reactMountReady.reset();
  },

  /**
   * After DOM is flushed, invoke all registered `onDOMReady` callbacks.
   */
  close: function() {
    this.reactMountReady.notifyAll();
  }
};

var PUT_LISTENER_QUEUEING = {
  initialize: function() {
    this.putListenerQueue.reset();
  },

  close: function() {
    this.putListenerQueue.putListeners();
  }
};

/**
 * Executed within the scope of the `Transaction` instance. Consider these as
 * being member methods, but with an implied ordering while being isolated from
 * each other.
 */
var TRANSACTION_WRAPPERS = [
  PUT_LISTENER_QUEUEING,
  SELECTION_RESTORATION,
  EVENT_SUPPRESSION,
  ON_DOM_READY_QUEUEING
];

/**
 * Currently:
 * - The order that these are listed in the transaction is critical:
 * - Suppresses events.
 * - Restores selection range.
 *
 * Future:
 * - Restore document/overflow scroll positions that were unintentionally
 *   modified via DOM insertions above the top viewport boundary.
 * - Implement/integrate with customized constraint based layout system and keep
 *   track of which dimensions must be remeasured.
 *
 * @class ReactReconcileTransaction
 */
function ReactReconcileTransaction() {
  this.reinitializeTransaction();
  // Only server-side rendering really needs this option (see
  // `ReactServerRendering`), but server-side uses
  // `ReactServerRenderingTransaction` instead. This option is here so that it's
  // accessible and defaults to false when `ReactDOMComponent` and
  // `ReactTextComponent` checks it in `mountComponent`.`
  this.renderToStaticMarkup = false;
  this.reactMountReady = CallbackQueue.getPooled(null);
  this.putListenerQueue = ReactPutListenerQueue.getPooled();
}

var Mixin = {
  /**
   * @see Transaction
   * @abstract
   * @final
   * @return {array<object>} List of operation wrap proceedures.
   *   TODO: convert to array<TransactionWrapper>
   */
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  },

  /**
   * @return {object} The queue to collect `onDOMReady` callbacks with.
   */
  getReactMountReady: function() {
    return this.reactMountReady;
  },

  getPutListenerQueue: function() {
    return this.putListenerQueue;
  },

  /**
   * `PooledClass` looks for this, and will invoke this before allowing this
   * instance to be resused.
   */
  destructor: function() {
    CallbackQueue.release(this.reactMountReady);
    this.reactMountReady = null;

    ReactPutListenerQueue.release(this.putListenerQueue);
    this.putListenerQueue = null;
  }
};


mixInto(ReactReconcileTransaction, Transaction.Mixin);
mixInto(ReactReconcileTransaction, Mixin);

PooledClass.addPoolingTo(ReactReconcileTransaction);

module.exports = ReactReconcileTransaction;

},{"./CallbackQueue":5,"./PooledClass":26,"./ReactBrowserEventEmitter":29,"./ReactInputSelection":58,"./ReactPutListenerQueue":70,"./Transaction":92,"./mixInto":133}],72:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactRootIndex
 * @typechecks
 */

"use strict";

var ReactRootIndexInjection = {
  /**
   * @param {function} _createReactRootIndex
   */
  injectCreateReactRootIndex: function(_createReactRootIndex) {
    ReactRootIndex.createReactRootIndex = _createReactRootIndex;
  }
};

var ReactRootIndex = {
  createReactRootIndex: null,
  injection: ReactRootIndexInjection
};

module.exports = ReactRootIndex;

},{}],73:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @typechecks static-only
 * @providesModule ReactServerRendering
 */
"use strict";

var ReactDescriptor = _dereq_("./ReactDescriptor");
var ReactInstanceHandles = _dereq_("./ReactInstanceHandles");
var ReactMarkupChecksum = _dereq_("./ReactMarkupChecksum");
var ReactServerRenderingTransaction =
  _dereq_("./ReactServerRenderingTransaction");

var instantiateReactComponent = _dereq_("./instantiateReactComponent");
var invariant = _dereq_("./invariant");

/**
 * @param {ReactComponent} component
 * @return {string} the HTML markup
 */
function renderComponentToString(component) {
  ("production" !== "development" ? invariant(
    ReactDescriptor.isValidDescriptor(component),
    'renderComponentToString(): You must pass a valid ReactComponent.'
  ) : invariant(ReactDescriptor.isValidDescriptor(component)));

  ("production" !== "development" ? invariant(
    !(arguments.length === 2 && typeof arguments[1] === 'function'),
    'renderComponentToString(): This function became synchronous and now ' +
    'returns the generated markup. Please remove the second parameter.'
  ) : invariant(!(arguments.length === 2 && typeof arguments[1] === 'function')));

  var transaction;
  try {
    var id = ReactInstanceHandles.createReactRootID();
    transaction = ReactServerRenderingTransaction.getPooled(false);

    return transaction.perform(function() {
      var componentInstance = instantiateReactComponent(component);
      var markup = componentInstance.mountComponent(id, transaction, 0);
      return ReactMarkupChecksum.addChecksumToMarkup(markup);
    }, null);
  } finally {
    ReactServerRenderingTransaction.release(transaction);
  }
}

/**
 * @param {ReactComponent} component
 * @return {string} the HTML markup, without the extra React ID and checksum
* (for generating static pages)
 */
function renderComponentToStaticMarkup(component) {
  ("production" !== "development" ? invariant(
    ReactDescriptor.isValidDescriptor(component),
    'renderComponentToStaticMarkup(): You must pass a valid ReactComponent.'
  ) : invariant(ReactDescriptor.isValidDescriptor(component)));

  var transaction;
  try {
    var id = ReactInstanceHandles.createReactRootID();
    transaction = ReactServerRenderingTransaction.getPooled(true);

    return transaction.perform(function() {
      var componentInstance = instantiateReactComponent(component);
      return componentInstance.mountComponent(id, transaction, 0);
    }, null);
  } finally {
    ReactServerRenderingTransaction.release(transaction);
  }
}

module.exports = {
  renderComponentToString: renderComponentToString,
  renderComponentToStaticMarkup: renderComponentToStaticMarkup
};

},{"./ReactDescriptor":51,"./ReactInstanceHandles":59,"./ReactMarkupChecksum":60,"./ReactServerRenderingTransaction":74,"./instantiateReactComponent":119,"./invariant":120}],74:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactServerRenderingTransaction
 * @typechecks
 */

"use strict";

var PooledClass = _dereq_("./PooledClass");
var CallbackQueue = _dereq_("./CallbackQueue");
var ReactPutListenerQueue = _dereq_("./ReactPutListenerQueue");
var Transaction = _dereq_("./Transaction");

var emptyFunction = _dereq_("./emptyFunction");
var mixInto = _dereq_("./mixInto");

/**
 * Provides a `CallbackQueue` queue for collecting `onDOMReady` callbacks
 * during the performing of the transaction.
 */
var ON_DOM_READY_QUEUEING = {
  /**
   * Initializes the internal `onDOMReady` queue.
   */
  initialize: function() {
    this.reactMountReady.reset();
  },

  close: emptyFunction
};

var PUT_LISTENER_QUEUEING = {
  initialize: function() {
    this.putListenerQueue.reset();
  },

  close: emptyFunction
};

/**
 * Executed within the scope of the `Transaction` instance. Consider these as
 * being member methods, but with an implied ordering while being isolated from
 * each other.
 */
var TRANSACTION_WRAPPERS = [
  PUT_LISTENER_QUEUEING,
  ON_DOM_READY_QUEUEING
];

/**
 * @class ReactServerRenderingTransaction
 * @param {boolean} renderToStaticMarkup
 */
function ReactServerRenderingTransaction(renderToStaticMarkup) {
  this.reinitializeTransaction();
  this.renderToStaticMarkup = renderToStaticMarkup;
  this.reactMountReady = CallbackQueue.getPooled(null);
  this.putListenerQueue = ReactPutListenerQueue.getPooled();
}

var Mixin = {
  /**
   * @see Transaction
   * @abstract
   * @final
   * @return {array} Empty list of operation wrap proceedures.
   */
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  },

  /**
   * @return {object} The queue to collect `onDOMReady` callbacks with.
   */
  getReactMountReady: function() {
    return this.reactMountReady;
  },

  getPutListenerQueue: function() {
    return this.putListenerQueue;
  },

  /**
   * `PooledClass` looks for this, and will invoke this before allowing this
   * instance to be resused.
   */
  destructor: function() {
    CallbackQueue.release(this.reactMountReady);
    this.reactMountReady = null;

    ReactPutListenerQueue.release(this.putListenerQueue);
    this.putListenerQueue = null;
  }
};


mixInto(ReactServerRenderingTransaction, Transaction.Mixin);
mixInto(ReactServerRenderingTransaction, Mixin);

PooledClass.addPoolingTo(ReactServerRenderingTransaction);

module.exports = ReactServerRenderingTransaction;

},{"./CallbackQueue":5,"./PooledClass":26,"./ReactPutListenerQueue":70,"./Transaction":92,"./emptyFunction":102,"./mixInto":133}],75:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactTextComponent
 * @typechecks static-only
 */

"use strict";

var DOMPropertyOperations = _dereq_("./DOMPropertyOperations");
var ReactBrowserComponentMixin = _dereq_("./ReactBrowserComponentMixin");
var ReactComponent = _dereq_("./ReactComponent");
var ReactDescriptor = _dereq_("./ReactDescriptor");

var escapeTextForBrowser = _dereq_("./escapeTextForBrowser");
var mixInto = _dereq_("./mixInto");

/**
 * Text nodes violate a couple assumptions that React makes about components:
 *
 *  - When mounting text into the DOM, adjacent text nodes are merged.
 *  - Text nodes cannot be assigned a React root ID.
 *
 * This component is used to wrap strings in elements so that they can undergo
 * the same reconciliation that is applied to elements.
 *
 * TODO: Investigate representing React components in the DOM with text nodes.
 *
 * @class ReactTextComponent
 * @extends ReactComponent
 * @internal
 */
var ReactTextComponent = function(descriptor) {
  this.construct(descriptor);
};

mixInto(ReactTextComponent, ReactComponent.Mixin);
mixInto(ReactTextComponent, ReactBrowserComponentMixin);
mixInto(ReactTextComponent, {

  /**
   * Creates the markup for this text node. This node is not intended to have
   * any features besides containing text content.
   *
   * @param {string} rootID DOM ID of the root node.
   * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
   * @param {number} mountDepth number of components in the owner hierarchy
   * @return {string} Markup for this text node.
   * @internal
   */
  mountComponent: function(rootID, transaction, mountDepth) {
    ReactComponent.Mixin.mountComponent.call(
      this,
      rootID,
      transaction,
      mountDepth
    );

    var escapedText = escapeTextForBrowser(this.props);

    if (transaction.renderToStaticMarkup) {
      // Normally we'd wrap this in a `span` for the reasons stated above, but
      // since this is a situation where React won't take over (static pages),
      // we can simply return the text as it is.
      return escapedText;
    }

    return (
      '<span ' + DOMPropertyOperations.createMarkupForID(rootID) + '>' +
        escapedText +
      '</span>'
    );
  },

  /**
   * Updates this component by updating the text content.
   *
   * @param {object} nextComponent Contains the next text content.
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  receiveComponent: function(nextComponent, transaction) {
    var nextProps = nextComponent.props;
    if (nextProps !== this.props) {
      this.props = nextProps;
      ReactComponent.BackendIDOperations.updateTextContentByID(
        this._rootNodeID,
        nextProps
      );
    }
  }

});

module.exports = ReactDescriptor.createFactory(ReactTextComponent);

},{"./DOMPropertyOperations":11,"./ReactBrowserComponentMixin":28,"./ReactComponent":31,"./ReactDescriptor":51,"./escapeTextForBrowser":104,"./mixInto":133}],76:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ReactUpdates
 */

"use strict";

var CallbackQueue = _dereq_("./CallbackQueue");
var PooledClass = _dereq_("./PooledClass");
var ReactCurrentOwner = _dereq_("./ReactCurrentOwner");
var ReactPerf = _dereq_("./ReactPerf");
var Transaction = _dereq_("./Transaction");

var invariant = _dereq_("./invariant");
var mixInto = _dereq_("./mixInto");
var warning = _dereq_("./warning");

var dirtyComponents = [];

var batchingStrategy = null;

function ensureInjected() {
  ("production" !== "development" ? invariant(
    ReactUpdates.ReactReconcileTransaction && batchingStrategy,
    'ReactUpdates: must inject a reconcile transaction class and batching ' +
    'strategy'
  ) : invariant(ReactUpdates.ReactReconcileTransaction && batchingStrategy));
}

var NESTED_UPDATES = {
  initialize: function() {
    this.dirtyComponentsLength = dirtyComponents.length;
  },
  close: function() {
    if (this.dirtyComponentsLength !== dirtyComponents.length) {
      // Additional updates were enqueued by componentDidUpdate handlers or
      // similar; before our own UPDATE_QUEUEING wrapper closes, we want to run
      // these new updates so that if A's componentDidUpdate calls setState on
      // B, B will update before the callback A's updater provided when calling
      // setState.
      dirtyComponents.splice(0, this.dirtyComponentsLength);
      flushBatchedUpdates();
    } else {
      dirtyComponents.length = 0;
    }
  }
};

var UPDATE_QUEUEING = {
  initialize: function() {
    this.callbackQueue.reset();
  },
  close: function() {
    this.callbackQueue.notifyAll();
  }
};

var TRANSACTION_WRAPPERS = [NESTED_UPDATES, UPDATE_QUEUEING];

function ReactUpdatesFlushTransaction() {
  this.reinitializeTransaction();
  this.dirtyComponentsLength = null;
  this.callbackQueue = CallbackQueue.getPooled(null);
  this.reconcileTransaction =
    ReactUpdates.ReactReconcileTransaction.getPooled();
}

mixInto(ReactUpdatesFlushTransaction, Transaction.Mixin);
mixInto(ReactUpdatesFlushTransaction, {
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  },

  destructor: function() {
    this.dirtyComponentsLength = null;
    CallbackQueue.release(this.callbackQueue);
    this.callbackQueue = null;
    ReactUpdates.ReactReconcileTransaction.release(this.reconcileTransaction);
    this.reconcileTransaction = null;
  },

  perform: function(method, scope, a) {
    // Essentially calls `this.reconcileTransaction.perform(method, scope, a)`
    // with this transaction's wrappers around it.
    return Transaction.Mixin.perform.call(
      this,
      this.reconcileTransaction.perform,
      this.reconcileTransaction,
      method,
      scope,
      a
    );
  }
});

PooledClass.addPoolingTo(ReactUpdatesFlushTransaction);

function batchedUpdates(callback, a, b) {
  ensureInjected();
  batchingStrategy.batchedUpdates(callback, a, b);
}

/**
 * Array comparator for ReactComponents by owner depth
 *
 * @param {ReactComponent} c1 first component you're comparing
 * @param {ReactComponent} c2 second component you're comparing
 * @return {number} Return value usable by Array.prototype.sort().
 */
function mountDepthComparator(c1, c2) {
  return c1._mountDepth - c2._mountDepth;
}

function runBatchedUpdates(transaction) {
  var len = transaction.dirtyComponentsLength;
  ("production" !== "development" ? invariant(
    len === dirtyComponents.length,
    'Expected flush transaction\'s stored dirty-components length (%s) to ' +
    'match dirty-components array length (%s).',
    len,
    dirtyComponents.length
  ) : invariant(len === dirtyComponents.length));

  // Since reconciling a component higher in the owner hierarchy usually (not
  // always -- see shouldComponentUpdate()) will reconcile children, reconcile
  // them before their children by sorting the array.
  dirtyComponents.sort(mountDepthComparator);

  for (var i = 0; i < len; i++) {
    // If a component is unmounted before pending changes apply, ignore them
    // TODO: Queue unmounts in the same list to avoid this happening at all
    var component = dirtyComponents[i];
    if (component.isMounted()) {
      // If performUpdateIfNecessary happens to enqueue any new updates, we
      // shouldn't execute the callbacks until the next render happens, so
      // stash the callbacks first
      var callbacks = component._pendingCallbacks;
      component._pendingCallbacks = null;
      component.performUpdateIfNecessary(transaction.reconcileTransaction);

      if (callbacks) {
        for (var j = 0; j < callbacks.length; j++) {
          transaction.callbackQueue.enqueue(
            callbacks[j],
            component
          );
        }
      }
    }
  }
}

var flushBatchedUpdates = ReactPerf.measure(
  'ReactUpdates',
  'flushBatchedUpdates',
  function() {
    // ReactUpdatesFlushTransaction's wrappers will clear the dirtyComponents
    // array and perform any updates enqueued by mount-ready handlers (i.e.,
    // componentDidUpdate) but we need to check here too in order to catch
    // updates enqueued by setState callbacks.
    while (dirtyComponents.length) {
      var transaction = ReactUpdatesFlushTransaction.getPooled();
      transaction.perform(runBatchedUpdates, null, transaction);
      ReactUpdatesFlushTransaction.release(transaction);
    }
  }
);

/**
 * Mark a component as needing a rerender, adding an optional callback to a
 * list of functions which will be executed once the rerender occurs.
 */
function enqueueUpdate(component, callback) {
  ("production" !== "development" ? invariant(
    !callback || typeof callback === "function",
    'enqueueUpdate(...): You called `setProps`, `replaceProps`, ' +
    '`setState`, `replaceState`, or `forceUpdate` with a callback that ' +
    'isn\'t callable.'
  ) : invariant(!callback || typeof callback === "function"));
  ensureInjected();

  // Various parts of our code (such as ReactCompositeComponent's
  // _renderValidatedComponent) assume that calls to render aren't nested;
  // verify that that's the case. (This is called by each top-level update
  // function, like setProps, setState, forceUpdate, etc.; creation and
  // destruction of top-level components is guarded in ReactMount.)
  ("production" !== "development" ? warning(
    ReactCurrentOwner.current == null,
    'enqueueUpdate(): Render methods should be a pure function of props ' +
    'and state; triggering nested component updates from render is not ' +
    'allowed. If necessary, trigger nested updates in ' +
    'componentDidUpdate.'
  ) : null);

  if (!batchingStrategy.isBatchingUpdates) {
    batchingStrategy.batchedUpdates(enqueueUpdate, component, callback);
    return;
  }

  dirtyComponents.push(component);

  if (callback) {
    if (component._pendingCallbacks) {
      component._pendingCallbacks.push(callback);
    } else {
      component._pendingCallbacks = [callback];
    }
  }
}

var ReactUpdatesInjection = {
  injectReconcileTransaction: function(ReconcileTransaction) {
    ("production" !== "development" ? invariant(
      ReconcileTransaction,
      'ReactUpdates: must provide a reconcile transaction class'
    ) : invariant(ReconcileTransaction));
    ReactUpdates.ReactReconcileTransaction = ReconcileTransaction;
  },

  injectBatchingStrategy: function(_batchingStrategy) {
    ("production" !== "development" ? invariant(
      _batchingStrategy,
      'ReactUpdates: must provide a batching strategy'
    ) : invariant(_batchingStrategy));
    ("production" !== "development" ? invariant(
      typeof _batchingStrategy.batchedUpdates === 'function',
      'ReactUpdates: must provide a batchedUpdates() function'
    ) : invariant(typeof _batchingStrategy.batchedUpdates === 'function'));
    ("production" !== "development" ? invariant(
      typeof _batchingStrategy.isBatchingUpdates === 'boolean',
      'ReactUpdates: must provide an isBatchingUpdates boolean attribute'
    ) : invariant(typeof _batchingStrategy.isBatchingUpdates === 'boolean'));
    batchingStrategy = _batchingStrategy;
  }
};

var ReactUpdates = {
  /**
   * React references `ReactReconcileTransaction` using this property in order
   * to allow dependency injection.
   *
   * @internal
   */
  ReactReconcileTransaction: null,

  batchedUpdates: batchedUpdates,
  enqueueUpdate: enqueueUpdate,
  flushBatchedUpdates: flushBatchedUpdates,
  injection: ReactUpdatesInjection
};

module.exports = ReactUpdates;

},{"./CallbackQueue":5,"./PooledClass":26,"./ReactCurrentOwner":35,"./ReactPerf":65,"./Transaction":92,"./invariant":120,"./mixInto":133,"./warning":143}],77:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SVGDOMPropertyConfig
 */

/*jslint bitwise: true*/

"use strict";

var DOMProperty = _dereq_("./DOMProperty");

var MUST_USE_ATTRIBUTE = DOMProperty.injection.MUST_USE_ATTRIBUTE;

var SVGDOMPropertyConfig = {
  Properties: {
    cx: MUST_USE_ATTRIBUTE,
    cy: MUST_USE_ATTRIBUTE,
    d: MUST_USE_ATTRIBUTE,
    dx: MUST_USE_ATTRIBUTE,
    dy: MUST_USE_ATTRIBUTE,
    fill: MUST_USE_ATTRIBUTE,
    fillOpacity: MUST_USE_ATTRIBUTE,
    fontFamily: MUST_USE_ATTRIBUTE,
    fontSize: MUST_USE_ATTRIBUTE,
    fx: MUST_USE_ATTRIBUTE,
    fy: MUST_USE_ATTRIBUTE,
    gradientTransform: MUST_USE_ATTRIBUTE,
    gradientUnits: MUST_USE_ATTRIBUTE,
    markerEnd: MUST_USE_ATTRIBUTE,
    markerMid: MUST_USE_ATTRIBUTE,
    markerStart: MUST_USE_ATTRIBUTE,
    offset: MUST_USE_ATTRIBUTE,
    opacity: MUST_USE_ATTRIBUTE,
    patternContentUnits: MUST_USE_ATTRIBUTE,
    patternUnits: MUST_USE_ATTRIBUTE,
    points: MUST_USE_ATTRIBUTE,
    preserveAspectRatio: MUST_USE_ATTRIBUTE,
    r: MUST_USE_ATTRIBUTE,
    rx: MUST_USE_ATTRIBUTE,
    ry: MUST_USE_ATTRIBUTE,
    spreadMethod: MUST_USE_ATTRIBUTE,
    stopColor: MUST_USE_ATTRIBUTE,
    stopOpacity: MUST_USE_ATTRIBUTE,
    stroke: MUST_USE_ATTRIBUTE,
    strokeDasharray: MUST_USE_ATTRIBUTE,
    strokeLinecap: MUST_USE_ATTRIBUTE,
    strokeOpacity: MUST_USE_ATTRIBUTE,
    strokeWidth: MUST_USE_ATTRIBUTE,
    textAnchor: MUST_USE_ATTRIBUTE,
    transform: MUST_USE_ATTRIBUTE,
    version: MUST_USE_ATTRIBUTE,
    viewBox: MUST_USE_ATTRIBUTE,
    x1: MUST_USE_ATTRIBUTE,
    x2: MUST_USE_ATTRIBUTE,
    x: MUST_USE_ATTRIBUTE,
    y1: MUST_USE_ATTRIBUTE,
    y2: MUST_USE_ATTRIBUTE,
    y: MUST_USE_ATTRIBUTE
  },
  DOMAttributeNames: {
    fillOpacity: 'fill-opacity',
    fontFamily: 'font-family',
    fontSize: 'font-size',
    gradientTransform: 'gradientTransform',
    gradientUnits: 'gradientUnits',
    markerEnd: 'marker-end',
    markerMid: 'marker-mid',
    markerStart: 'marker-start',
    patternContentUnits: 'patternContentUnits',
    patternUnits: 'patternUnits',
    preserveAspectRatio: 'preserveAspectRatio',
    spreadMethod: 'spreadMethod',
    stopColor: 'stop-color',
    stopOpacity: 'stop-opacity',
    strokeDasharray: 'stroke-dasharray',
    strokeLinecap: 'stroke-linecap',
    strokeOpacity: 'stroke-opacity',
    strokeWidth: 'stroke-width',
    textAnchor: 'text-anchor',
    viewBox: 'viewBox'
  }
};

module.exports = SVGDOMPropertyConfig;

},{"./DOMProperty":10}],78:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SelectEventPlugin
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPropagators = _dereq_("./EventPropagators");
var ReactInputSelection = _dereq_("./ReactInputSelection");
var SyntheticEvent = _dereq_("./SyntheticEvent");

var getActiveElement = _dereq_("./getActiveElement");
var isTextInputElement = _dereq_("./isTextInputElement");
var keyOf = _dereq_("./keyOf");
var shallowEqual = _dereq_("./shallowEqual");

var topLevelTypes = EventConstants.topLevelTypes;

var eventTypes = {
  select: {
    phasedRegistrationNames: {
      bubbled: keyOf({onSelect: null}),
      captured: keyOf({onSelectCapture: null})
    },
    dependencies: [
      topLevelTypes.topBlur,
      topLevelTypes.topContextMenu,
      topLevelTypes.topFocus,
      topLevelTypes.topKeyDown,
      topLevelTypes.topMouseDown,
      topLevelTypes.topMouseUp,
      topLevelTypes.topSelectionChange
    ]
  }
};

var activeElement = null;
var activeElementID = null;
var lastSelection = null;
var mouseDown = false;

/**
 * Get an object which is a unique representation of the current selection.
 *
 * The return value will not be consistent across nodes or browsers, but
 * two identical selections on the same node will return identical objects.
 *
 * @param {DOMElement} node
 * @param {object}
 */
function getSelection(node) {
  if ('selectionStart' in node &&
      ReactInputSelection.hasSelectionCapabilities(node)) {
    return {
      start: node.selectionStart,
      end: node.selectionEnd
    };
  } else if (document.selection) {
    var range = document.selection.createRange();
    return {
      parentElement: range.parentElement(),
      text: range.text,
      top: range.boundingTop,
      left: range.boundingLeft
    };
  } else {
    var selection = window.getSelection();
    return {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset
    };
  }
}

/**
 * Poll selection to see whether it's changed.
 *
 * @param {object} nativeEvent
 * @return {?SyntheticEvent}
 */
function constructSelectEvent(nativeEvent) {
  // Ensure we have the right element, and that the user is not dragging a
  // selection (this matches native `select` event behavior). In HTML5, select
  // fires only on input and textarea thus if there's no focused element we
  // won't dispatch.
  if (mouseDown ||
      activeElement == null ||
      activeElement != getActiveElement()) {
    return;
  }

  // Only fire when selection has actually changed.
  var currentSelection = getSelection(activeElement);
  if (!lastSelection || !shallowEqual(lastSelection, currentSelection)) {
    lastSelection = currentSelection;

    var syntheticEvent = SyntheticEvent.getPooled(
      eventTypes.select,
      activeElementID,
      nativeEvent
    );

    syntheticEvent.type = 'select';
    syntheticEvent.target = activeElement;

    EventPropagators.accumulateTwoPhaseDispatches(syntheticEvent);

    return syntheticEvent;
  }
}

/**
 * This plugin creates an `onSelect` event that normalizes select events
 * across form elements.
 *
 * Supported elements are:
 * - input (see `isTextInputElement`)
 * - textarea
 * - contentEditable
 *
 * This differs from native browser implementations in the following ways:
 * - Fires on contentEditable fields as well as inputs.
 * - Fires for collapsed selection.
 * - Fires after user input.
 */
var SelectEventPlugin = {

  eventTypes: eventTypes,

  /**
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {

    switch (topLevelType) {
      // Track the input node that has focus.
      case topLevelTypes.topFocus:
        if (isTextInputElement(topLevelTarget) ||
            topLevelTarget.contentEditable === 'true') {
          activeElement = topLevelTarget;
          activeElementID = topLevelTargetID;
          lastSelection = null;
        }
        break;
      case topLevelTypes.topBlur:
        activeElement = null;
        activeElementID = null;
        lastSelection = null;
        break;

      // Don't fire the event while the user is dragging. This matches the
      // semantics of the native select event.
      case topLevelTypes.topMouseDown:
        mouseDown = true;
        break;
      case topLevelTypes.topContextMenu:
      case topLevelTypes.topMouseUp:
        mouseDown = false;
        return constructSelectEvent(nativeEvent);

      // Chrome and IE fire non-standard event when selection is changed (and
      // sometimes when it hasn't).
      // Firefox doesn't support selectionchange, so check selection status
      // after each key entry. The selection changes after keydown and before
      // keyup, but we check on keydown as well in the case of holding down a
      // key, when multiple keydown events are fired but only one keyup is.
      case topLevelTypes.topSelectionChange:
      case topLevelTypes.topKeyDown:
      case topLevelTypes.topKeyUp:
        return constructSelectEvent(nativeEvent);
    }
  }
};

module.exports = SelectEventPlugin;

},{"./EventConstants":15,"./EventPropagators":20,"./ReactInputSelection":58,"./SyntheticEvent":84,"./getActiveElement":108,"./isTextInputElement":123,"./keyOf":127,"./shallowEqual":139}],79:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ServerReactRootIndex
 * @typechecks
 */

"use strict";

/**
 * Size of the reactRoot ID space. We generate random numbers for React root
 * IDs and if there's a collision the events and DOM update system will
 * get confused. In the future we need a way to generate GUIDs but for
 * now this will work on a smaller scale.
 */
var GLOBAL_MOUNT_POINT_MAX = Math.pow(2, 53);

var ServerReactRootIndex = {
  createReactRootIndex: function() {
    return Math.ceil(Math.random() * GLOBAL_MOUNT_POINT_MAX);
  }
};

module.exports = ServerReactRootIndex;

},{}],80:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SimpleEventPlugin
 */

"use strict";

var EventConstants = _dereq_("./EventConstants");
var EventPluginUtils = _dereq_("./EventPluginUtils");
var EventPropagators = _dereq_("./EventPropagators");
var SyntheticClipboardEvent = _dereq_("./SyntheticClipboardEvent");
var SyntheticEvent = _dereq_("./SyntheticEvent");
var SyntheticFocusEvent = _dereq_("./SyntheticFocusEvent");
var SyntheticKeyboardEvent = _dereq_("./SyntheticKeyboardEvent");
var SyntheticMouseEvent = _dereq_("./SyntheticMouseEvent");
var SyntheticDragEvent = _dereq_("./SyntheticDragEvent");
var SyntheticTouchEvent = _dereq_("./SyntheticTouchEvent");
var SyntheticUIEvent = _dereq_("./SyntheticUIEvent");
var SyntheticWheelEvent = _dereq_("./SyntheticWheelEvent");

var invariant = _dereq_("./invariant");
var keyOf = _dereq_("./keyOf");

var topLevelTypes = EventConstants.topLevelTypes;

var eventTypes = {
  blur: {
    phasedRegistrationNames: {
      bubbled: keyOf({onBlur: true}),
      captured: keyOf({onBlurCapture: true})
    }
  },
  click: {
    phasedRegistrationNames: {
      bubbled: keyOf({onClick: true}),
      captured: keyOf({onClickCapture: true})
    }
  },
  contextMenu: {
    phasedRegistrationNames: {
      bubbled: keyOf({onContextMenu: true}),
      captured: keyOf({onContextMenuCapture: true})
    }
  },
  copy: {
    phasedRegistrationNames: {
      bubbled: keyOf({onCopy: true}),
      captured: keyOf({onCopyCapture: true})
    }
  },
  cut: {
    phasedRegistrationNames: {
      bubbled: keyOf({onCut: true}),
      captured: keyOf({onCutCapture: true})
    }
  },
  doubleClick: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDoubleClick: true}),
      captured: keyOf({onDoubleClickCapture: true})
    }
  },
  drag: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDrag: true}),
      captured: keyOf({onDragCapture: true})
    }
  },
  dragEnd: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDragEnd: true}),
      captured: keyOf({onDragEndCapture: true})
    }
  },
  dragEnter: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDragEnter: true}),
      captured: keyOf({onDragEnterCapture: true})
    }
  },
  dragExit: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDragExit: true}),
      captured: keyOf({onDragExitCapture: true})
    }
  },
  dragLeave: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDragLeave: true}),
      captured: keyOf({onDragLeaveCapture: true})
    }
  },
  dragOver: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDragOver: true}),
      captured: keyOf({onDragOverCapture: true})
    }
  },
  dragStart: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDragStart: true}),
      captured: keyOf({onDragStartCapture: true})
    }
  },
  drop: {
    phasedRegistrationNames: {
      bubbled: keyOf({onDrop: true}),
      captured: keyOf({onDropCapture: true})
    }
  },
  focus: {
    phasedRegistrationNames: {
      bubbled: keyOf({onFocus: true}),
      captured: keyOf({onFocusCapture: true})
    }
  },
  input: {
    phasedRegistrationNames: {
      bubbled: keyOf({onInput: true}),
      captured: keyOf({onInputCapture: true})
    }
  },
  keyDown: {
    phasedRegistrationNames: {
      bubbled: keyOf({onKeyDown: true}),
      captured: keyOf({onKeyDownCapture: true})
    }
  },
  keyPress: {
    phasedRegistrationNames: {
      bubbled: keyOf({onKeyPress: true}),
      captured: keyOf({onKeyPressCapture: true})
    }
  },
  keyUp: {
    phasedRegistrationNames: {
      bubbled: keyOf({onKeyUp: true}),
      captured: keyOf({onKeyUpCapture: true})
    }
  },
  load: {
    phasedRegistrationNames: {
      bubbled: keyOf({onLoad: true}),
      captured: keyOf({onLoadCapture: true})
    }
  },
  error: {
    phasedRegistrationNames: {
      bubbled: keyOf({onError: true}),
      captured: keyOf({onErrorCapture: true})
    }
  },
  // Note: We do not allow listening to mouseOver events. Instead, use the
  // onMouseEnter/onMouseLeave created by `EnterLeaveEventPlugin`.
  mouseDown: {
    phasedRegistrationNames: {
      bubbled: keyOf({onMouseDown: true}),
      captured: keyOf({onMouseDownCapture: true})
    }
  },
  mouseMove: {
    phasedRegistrationNames: {
      bubbled: keyOf({onMouseMove: true}),
      captured: keyOf({onMouseMoveCapture: true})
    }
  },
  mouseOut: {
    phasedRegistrationNames: {
      bubbled: keyOf({onMouseOut: true}),
      captured: keyOf({onMouseOutCapture: true})
    }
  },
  mouseOver: {
    phasedRegistrationNames: {
      bubbled: keyOf({onMouseOver: true}),
      captured: keyOf({onMouseOverCapture: true})
    }
  },
  mouseUp: {
    phasedRegistrationNames: {
      bubbled: keyOf({onMouseUp: true}),
      captured: keyOf({onMouseUpCapture: true})
    }
  },
  paste: {
    phasedRegistrationNames: {
      bubbled: keyOf({onPaste: true}),
      captured: keyOf({onPasteCapture: true})
    }
  },
  reset: {
    phasedRegistrationNames: {
      bubbled: keyOf({onReset: true}),
      captured: keyOf({onResetCapture: true})
    }
  },
  scroll: {
    phasedRegistrationNames: {
      bubbled: keyOf({onScroll: true}),
      captured: keyOf({onScrollCapture: true})
    }
  },
  submit: {
    phasedRegistrationNames: {
      bubbled: keyOf({onSubmit: true}),
      captured: keyOf({onSubmitCapture: true})
    }
  },
  touchCancel: {
    phasedRegistrationNames: {
      bubbled: keyOf({onTouchCancel: true}),
      captured: keyOf({onTouchCancelCapture: true})
    }
  },
  touchEnd: {
    phasedRegistrationNames: {
      bubbled: keyOf({onTouchEnd: true}),
      captured: keyOf({onTouchEndCapture: true})
    }
  },
  touchMove: {
    phasedRegistrationNames: {
      bubbled: keyOf({onTouchMove: true}),
      captured: keyOf({onTouchMoveCapture: true})
    }
  },
  touchStart: {
    phasedRegistrationNames: {
      bubbled: keyOf({onTouchStart: true}),
      captured: keyOf({onTouchStartCapture: true})
    }
  },
  wheel: {
    phasedRegistrationNames: {
      bubbled: keyOf({onWheel: true}),
      captured: keyOf({onWheelCapture: true})
    }
  }
};

var topLevelEventsToDispatchConfig = {
  topBlur:        eventTypes.blur,
  topClick:       eventTypes.click,
  topContextMenu: eventTypes.contextMenu,
  topCopy:        eventTypes.copy,
  topCut:         eventTypes.cut,
  topDoubleClick: eventTypes.doubleClick,
  topDrag:        eventTypes.drag,
  topDragEnd:     eventTypes.dragEnd,
  topDragEnter:   eventTypes.dragEnter,
  topDragExit:    eventTypes.dragExit,
  topDragLeave:   eventTypes.dragLeave,
  topDragOver:    eventTypes.dragOver,
  topDragStart:   eventTypes.dragStart,
  topDrop:        eventTypes.drop,
  topError:       eventTypes.error,
  topFocus:       eventTypes.focus,
  topInput:       eventTypes.input,
  topKeyDown:     eventTypes.keyDown,
  topKeyPress:    eventTypes.keyPress,
  topKeyUp:       eventTypes.keyUp,
  topLoad:        eventTypes.load,
  topMouseDown:   eventTypes.mouseDown,
  topMouseMove:   eventTypes.mouseMove,
  topMouseOut:    eventTypes.mouseOut,
  topMouseOver:   eventTypes.mouseOver,
  topMouseUp:     eventTypes.mouseUp,
  topPaste:       eventTypes.paste,
  topReset:       eventTypes.reset,
  topScroll:      eventTypes.scroll,
  topSubmit:      eventTypes.submit,
  topTouchCancel: eventTypes.touchCancel,
  topTouchEnd:    eventTypes.touchEnd,
  topTouchMove:   eventTypes.touchMove,
  topTouchStart:  eventTypes.touchStart,
  topWheel:       eventTypes.wheel
};

for (var topLevelType in topLevelEventsToDispatchConfig) {
  topLevelEventsToDispatchConfig[topLevelType].dependencies = [topLevelType];
}

var SimpleEventPlugin = {

  eventTypes: eventTypes,

  /**
   * Same as the default implementation, except cancels the event when return
   * value is false.
   *
   * @param {object} Event to be dispatched.
   * @param {function} Application-level callback.
   * @param {string} domID DOM ID to pass to the callback.
   */
  executeDispatch: function(event, listener, domID) {
    var returnValue = EventPluginUtils.executeDispatch(event, listener, domID);
    if (returnValue === false) {
      event.stopPropagation();
      event.preventDefault();
    }
  },

  /**
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {
    var dispatchConfig = topLevelEventsToDispatchConfig[topLevelType];
    if (!dispatchConfig) {
      return null;
    }
    var EventConstructor;
    switch (topLevelType) {
      case topLevelTypes.topInput:
      case topLevelTypes.topLoad:
      case topLevelTypes.topError:
      case topLevelTypes.topReset:
      case topLevelTypes.topSubmit:
        // HTML Events
        // @see http://www.w3.org/TR/html5/index.html#events-0
        EventConstructor = SyntheticEvent;
        break;
      case topLevelTypes.topKeyPress:
        // FireFox creates a keypress event for function keys too. This removes
        // the unwanted keypress events.
        if (nativeEvent.charCode === 0) {
          return null;
        }
        /* falls through */
      case topLevelTypes.topKeyDown:
      case topLevelTypes.topKeyUp:
        EventConstructor = SyntheticKeyboardEvent;
        break;
      case topLevelTypes.topBlur:
      case topLevelTypes.topFocus:
        EventConstructor = SyntheticFocusEvent;
        break;
      case topLevelTypes.topClick:
        // Firefox creates a click event on right mouse clicks. This removes the
        // unwanted click events.
        if (nativeEvent.button === 2) {
          return null;
        }
        /* falls through */
      case topLevelTypes.topContextMenu:
      case topLevelTypes.topDoubleClick:
      case topLevelTypes.topMouseDown:
      case topLevelTypes.topMouseMove:
      case topLevelTypes.topMouseOut:
      case topLevelTypes.topMouseOver:
      case topLevelTypes.topMouseUp:
        EventConstructor = SyntheticMouseEvent;
        break;
      case topLevelTypes.topDrag:
      case topLevelTypes.topDragEnd:
      case topLevelTypes.topDragEnter:
      case topLevelTypes.topDragExit:
      case topLevelTypes.topDragLeave:
      case topLevelTypes.topDragOver:
      case topLevelTypes.topDragStart:
      case topLevelTypes.topDrop:
        EventConstructor = SyntheticDragEvent;
        break;
      case topLevelTypes.topTouchCancel:
      case topLevelTypes.topTouchEnd:
      case topLevelTypes.topTouchMove:
      case topLevelTypes.topTouchStart:
        EventConstructor = SyntheticTouchEvent;
        break;
      case topLevelTypes.topScroll:
        EventConstructor = SyntheticUIEvent;
        break;
      case topLevelTypes.topWheel:
        EventConstructor = SyntheticWheelEvent;
        break;
      case topLevelTypes.topCopy:
      case topLevelTypes.topCut:
      case topLevelTypes.topPaste:
        EventConstructor = SyntheticClipboardEvent;
        break;
    }
    ("production" !== "development" ? invariant(
      EventConstructor,
      'SimpleEventPlugin: Unhandled event type, `%s`.',
      topLevelType
    ) : invariant(EventConstructor));
    var event = EventConstructor.getPooled(
      dispatchConfig,
      topLevelTargetID,
      nativeEvent
    );
    EventPropagators.accumulateTwoPhaseDispatches(event);
    return event;
  }

};

module.exports = SimpleEventPlugin;

},{"./EventConstants":15,"./EventPluginUtils":19,"./EventPropagators":20,"./SyntheticClipboardEvent":81,"./SyntheticDragEvent":83,"./SyntheticEvent":84,"./SyntheticFocusEvent":85,"./SyntheticKeyboardEvent":87,"./SyntheticMouseEvent":88,"./SyntheticTouchEvent":89,"./SyntheticUIEvent":90,"./SyntheticWheelEvent":91,"./invariant":120,"./keyOf":127}],81:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticClipboardEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticEvent = _dereq_("./SyntheticEvent");

/**
 * @interface Event
 * @see http://www.w3.org/TR/clipboard-apis/
 */
var ClipboardEventInterface = {
  clipboardData: function(event) {
    return (
      'clipboardData' in event ?
        event.clipboardData :
        window.clipboardData
    );
  }
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticClipboardEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticEvent.augmentClass(SyntheticClipboardEvent, ClipboardEventInterface);

module.exports = SyntheticClipboardEvent;


},{"./SyntheticEvent":84}],82:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticCompositionEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticEvent = _dereq_("./SyntheticEvent");

/**
 * @interface Event
 * @see http://www.w3.org/TR/DOM-Level-3-Events/#events-compositionevents
 */
var CompositionEventInterface = {
  data: null
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticCompositionEvent(
  dispatchConfig,
  dispatchMarker,
  nativeEvent) {
  SyntheticEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticEvent.augmentClass(
  SyntheticCompositionEvent,
  CompositionEventInterface
);

module.exports = SyntheticCompositionEvent;


},{"./SyntheticEvent":84}],83:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticDragEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticMouseEvent = _dereq_("./SyntheticMouseEvent");

/**
 * @interface DragEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
var DragEventInterface = {
  dataTransfer: null
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticDragEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticMouseEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticMouseEvent.augmentClass(SyntheticDragEvent, DragEventInterface);

module.exports = SyntheticDragEvent;

},{"./SyntheticMouseEvent":88}],84:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticEvent
 * @typechecks static-only
 */

"use strict";

var PooledClass = _dereq_("./PooledClass");

var emptyFunction = _dereq_("./emptyFunction");
var getEventTarget = _dereq_("./getEventTarget");
var merge = _dereq_("./merge");
var mergeInto = _dereq_("./mergeInto");

/**
 * @interface Event
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
var EventInterface = {
  type: null,
  target: getEventTarget,
  // currentTarget is set when dispatching; no use in copying it here
  currentTarget: emptyFunction.thatReturnsNull,
  eventPhase: null,
  bubbles: null,
  cancelable: null,
  timeStamp: function(event) {
    return event.timeStamp || Date.now();
  },
  defaultPrevented: null,
  isTrusted: null
};

/**
 * Synthetic events are dispatched by event plugins, typically in response to a
 * top-level event delegation handler.
 *
 * These systems should generally use pooling to reduce the frequency of garbage
 * collection. The system should check `isPersistent` to determine whether the
 * event should be released into the pool after being dispatched. Users that
 * need a persisted event should invoke `persist`.
 *
 * Synthetic events (and subclasses) implement the DOM Level 3 Events API by
 * normalizing browser quirks. Subclasses do not necessarily have to implement a
 * DOM interface; custom application-specific events can also subclass this.
 *
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 */
function SyntheticEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  this.dispatchConfig = dispatchConfig;
  this.dispatchMarker = dispatchMarker;
  this.nativeEvent = nativeEvent;

  var Interface = this.constructor.Interface;
  for (var propName in Interface) {
    if (!Interface.hasOwnProperty(propName)) {
      continue;
    }
    var normalize = Interface[propName];
    if (normalize) {
      this[propName] = normalize(nativeEvent);
    } else {
      this[propName] = nativeEvent[propName];
    }
  }

  var defaultPrevented = nativeEvent.defaultPrevented != null ?
    nativeEvent.defaultPrevented :
    nativeEvent.returnValue === false;
  if (defaultPrevented) {
    this.isDefaultPrevented = emptyFunction.thatReturnsTrue;
  } else {
    this.isDefaultPrevented = emptyFunction.thatReturnsFalse;
  }
  this.isPropagationStopped = emptyFunction.thatReturnsFalse;
}

mergeInto(SyntheticEvent.prototype, {

  preventDefault: function() {
    this.defaultPrevented = true;
    var event = this.nativeEvent;
    event.preventDefault ? event.preventDefault() : event.returnValue = false;
    this.isDefaultPrevented = emptyFunction.thatReturnsTrue;
  },

  stopPropagation: function() {
    var event = this.nativeEvent;
    event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true;
    this.isPropagationStopped = emptyFunction.thatReturnsTrue;
  },

  /**
   * We release all dispatched `SyntheticEvent`s after each event loop, adding
   * them back into the pool. This allows a way to hold onto a reference that
   * won't be added back into the pool.
   */
  persist: function() {
    this.isPersistent = emptyFunction.thatReturnsTrue;
  },

  /**
   * Checks if this event should be released back into the pool.
   *
   * @return {boolean} True if this should not be released, false otherwise.
   */
  isPersistent: emptyFunction.thatReturnsFalse,

  /**
   * `PooledClass` looks for `destructor` on each instance it releases.
   */
  destructor: function() {
    var Interface = this.constructor.Interface;
    for (var propName in Interface) {
      this[propName] = null;
    }
    this.dispatchConfig = null;
    this.dispatchMarker = null;
    this.nativeEvent = null;
  }

});

SyntheticEvent.Interface = EventInterface;

/**
 * Helper to reduce boilerplate when creating subclasses.
 *
 * @param {function} Class
 * @param {?object} Interface
 */
SyntheticEvent.augmentClass = function(Class, Interface) {
  var Super = this;

  var prototype = Object.create(Super.prototype);
  mergeInto(prototype, Class.prototype);
  Class.prototype = prototype;
  Class.prototype.constructor = Class;

  Class.Interface = merge(Super.Interface, Interface);
  Class.augmentClass = Super.augmentClass;

  PooledClass.addPoolingTo(Class, PooledClass.threeArgumentPooler);
};

PooledClass.addPoolingTo(SyntheticEvent, PooledClass.threeArgumentPooler);

module.exports = SyntheticEvent;

},{"./PooledClass":26,"./emptyFunction":102,"./getEventTarget":111,"./merge":130,"./mergeInto":132}],85:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticFocusEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticUIEvent = _dereq_("./SyntheticUIEvent");

/**
 * @interface FocusEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
var FocusEventInterface = {
  relatedTarget: null
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticFocusEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticUIEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticUIEvent.augmentClass(SyntheticFocusEvent, FocusEventInterface);

module.exports = SyntheticFocusEvent;

},{"./SyntheticUIEvent":90}],86:[function(_dereq_,module,exports){
/**
 * Copyright 2013 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticInputEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticEvent = _dereq_("./SyntheticEvent");

/**
 * @interface Event
 * @see http://www.w3.org/TR/2013/WD-DOM-Level-3-Events-20131105
 *      /#events-inputevents
 */
var InputEventInterface = {
  data: null
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticInputEvent(
  dispatchConfig,
  dispatchMarker,
  nativeEvent) {
  SyntheticEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticEvent.augmentClass(
  SyntheticInputEvent,
  InputEventInterface
);

module.exports = SyntheticInputEvent;


},{"./SyntheticEvent":84}],87:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticKeyboardEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticUIEvent = _dereq_("./SyntheticUIEvent");

var getEventKey = _dereq_("./getEventKey");
var getEventModifierState = _dereq_("./getEventModifierState");

/**
 * @interface KeyboardEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
var KeyboardEventInterface = {
  key: getEventKey,
  location: null,
  ctrlKey: null,
  shiftKey: null,
  altKey: null,
  metaKey: null,
  repeat: null,
  locale: null,
  getModifierState: getEventModifierState,
  // Legacy Interface
  charCode: function(event) {
    // `charCode` is the result of a KeyPress event and represents the value of
    // the actual printable character.

    // KeyPress is deprecated but its replacement is not yet final and not
    // implemented in any major browser.
    if (event.type === 'keypress') {
      // IE8 does not implement "charCode", but "keyCode" has the correct value.
      return 'charCode' in event ? event.charCode : event.keyCode;
    }
    return 0;
  },
  keyCode: function(event) {
    // `keyCode` is the result of a KeyDown/Up event and represents the value of
    // physical keyboard key.

    // The actual meaning of the value depends on the users' keyboard layout
    // which cannot be detected. Assuming that it is a US keyboard layout
    // provides a surprisingly accurate mapping for US and European users.
    // Due to this, it is left to the user to implement at this time.
    if (event.type === 'keydown' || event.type === 'keyup') {
      return event.keyCode;
    }
    return 0;
  },
  which: function(event) {
    // `which` is an alias for either `keyCode` or `charCode` depending on the
    // type of the event. There is no need to determine the type of the event
    // as `keyCode` and `charCode` are either aliased or default to zero.
    return event.keyCode || event.charCode;
  }
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticKeyboardEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticUIEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticUIEvent.augmentClass(SyntheticKeyboardEvent, KeyboardEventInterface);

module.exports = SyntheticKeyboardEvent;

},{"./SyntheticUIEvent":90,"./getEventKey":109,"./getEventModifierState":110}],88:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticMouseEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticUIEvent = _dereq_("./SyntheticUIEvent");
var ViewportMetrics = _dereq_("./ViewportMetrics");

var getEventModifierState = _dereq_("./getEventModifierState");

/**
 * @interface MouseEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
var MouseEventInterface = {
  screenX: null,
  screenY: null,
  clientX: null,
  clientY: null,
  ctrlKey: null,
  shiftKey: null,
  altKey: null,
  metaKey: null,
  getModifierState: getEventModifierState,
  button: function(event) {
    // Webkit, Firefox, IE9+
    // which:  1 2 3
    // button: 0 1 2 (standard)
    var button = event.button;
    if ('which' in event) {
      return button;
    }
    // IE<9
    // which:  undefined
    // button: 0 0 0
    // button: 1 4 2 (onmouseup)
    return button === 2 ? 2 : button === 4 ? 1 : 0;
  },
  buttons: null,
  relatedTarget: function(event) {
    return event.relatedTarget || (
      event.fromElement === event.srcElement ?
        event.toElement :
        event.fromElement
    );
  },
  // "Proprietary" Interface.
  pageX: function(event) {
    return 'pageX' in event ?
      event.pageX :
      event.clientX + ViewportMetrics.currentScrollLeft;
  },
  pageY: function(event) {
    return 'pageY' in event ?
      event.pageY :
      event.clientY + ViewportMetrics.currentScrollTop;
  }
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticMouseEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticUIEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticUIEvent.augmentClass(SyntheticMouseEvent, MouseEventInterface);

module.exports = SyntheticMouseEvent;

},{"./SyntheticUIEvent":90,"./ViewportMetrics":93,"./getEventModifierState":110}],89:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticTouchEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticUIEvent = _dereq_("./SyntheticUIEvent");

var getEventModifierState = _dereq_("./getEventModifierState");

/**
 * @interface TouchEvent
 * @see http://www.w3.org/TR/touch-events/
 */
var TouchEventInterface = {
  touches: null,
  targetTouches: null,
  changedTouches: null,
  altKey: null,
  metaKey: null,
  ctrlKey: null,
  shiftKey: null,
  getModifierState: getEventModifierState
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticUIEvent}
 */
function SyntheticTouchEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticUIEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticUIEvent.augmentClass(SyntheticTouchEvent, TouchEventInterface);

module.exports = SyntheticTouchEvent;

},{"./SyntheticUIEvent":90,"./getEventModifierState":110}],90:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticUIEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticEvent = _dereq_("./SyntheticEvent");

var getEventTarget = _dereq_("./getEventTarget");

/**
 * @interface UIEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
var UIEventInterface = {
  view: function(event) {
    if (event.view) {
      return event.view;
    }

    var target = getEventTarget(event);
    if (target != null && target.window === target) {
      // target is a window object
      return target;
    }

    var doc = target.ownerDocument;
    // TODO: Figure out why `ownerDocument` is sometimes undefined in IE8.
    if (doc) {
      return doc.defaultView || doc.parentWindow;
    } else {
      return window;
    }
  },
  detail: function(event) {
    return event.detail || 0;
  }
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticEvent}
 */
function SyntheticUIEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticEvent.augmentClass(SyntheticUIEvent, UIEventInterface);

module.exports = SyntheticUIEvent;

},{"./SyntheticEvent":84,"./getEventTarget":111}],91:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule SyntheticWheelEvent
 * @typechecks static-only
 */

"use strict";

var SyntheticMouseEvent = _dereq_("./SyntheticMouseEvent");

/**
 * @interface WheelEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */
var WheelEventInterface = {
  deltaX: function(event) {
    return (
      'deltaX' in event ? event.deltaX :
      // Fallback to `wheelDeltaX` for Webkit and normalize (right is positive).
      'wheelDeltaX' in event ? -event.wheelDeltaX : 0
    );
  },
  deltaY: function(event) {
    return (
      'deltaY' in event ? event.deltaY :
      // Fallback to `wheelDeltaY` for Webkit and normalize (down is positive).
      'wheelDeltaY' in event ? -event.wheelDeltaY :
      // Fallback to `wheelDelta` for IE<9 and normalize (down is positive).
      'wheelDelta' in event ? -event.wheelDelta : 0
    );
  },
  deltaZ: null,

  // Browsers without "deltaMode" is reporting in raw wheel delta where one
  // notch on the scroll is always +/- 120, roughly equivalent to pixels.
  // A good approximation of DOM_DELTA_LINE (1) is 5% of viewport size or
  // ~40 pixels, for DOM_DELTA_SCREEN (2) it is 87.5% of viewport size.
  deltaMode: null
};

/**
 * @param {object} dispatchConfig Configuration used to dispatch this event.
 * @param {string} dispatchMarker Marker identifying the event target.
 * @param {object} nativeEvent Native browser event.
 * @extends {SyntheticMouseEvent}
 */
function SyntheticWheelEvent(dispatchConfig, dispatchMarker, nativeEvent) {
  SyntheticMouseEvent.call(this, dispatchConfig, dispatchMarker, nativeEvent);
}

SyntheticMouseEvent.augmentClass(SyntheticWheelEvent, WheelEventInterface);

module.exports = SyntheticWheelEvent;

},{"./SyntheticMouseEvent":88}],92:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule Transaction
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * `Transaction` creates a black box that is able to wrap any method such that
 * certain invariants are maintained before and after the method is invoked
 * (Even if an exception is thrown while invoking the wrapped method). Whoever
 * instantiates a transaction can provide enforcers of the invariants at
 * creation time. The `Transaction` class itself will supply one additional
 * automatic invariant for you - the invariant that any transaction instance
 * should not be run while it is already being run. You would typically create a
 * single instance of a `Transaction` for reuse multiple times, that potentially
 * is used to wrap several different methods. Wrappers are extremely simple -
 * they only require implementing two methods.
 *
 * <pre>
 *                       wrappers (injected at creation time)
 *                                      +        +
 *                                      |        |
 *                    +-----------------|--------|--------------+
 *                    |                 v        |              |
 *                    |      +---------------+   |              |
 *                    |   +--|    wrapper1   |---|----+         |
 *                    |   |  +---------------+   v    |         |
 *                    |   |          +-------------+  |         |
 *                    |   |     +----|   wrapper2  |--------+   |
 *                    |   |     |    +-------------+  |     |   |
 *                    |   |     |                     |     |   |
 *                    |   v     v                     v     v   | wrapper
 *                    | +---+ +---+   +---------+   +---+ +---+ | invariants
 * perform(anyMethod) | |   | |   |   |         |   |   | |   | | maintained
 * +----------------->|-|---|-|---|-->|anyMethod|---|---|-|---|-|-------->
 *                    | |   | |   |   |         |   |   | |   | |
 *                    | |   | |   |   |         |   |   | |   | |
 *                    | |   | |   |   |         |   |   | |   | |
 *                    | +---+ +---+   +---------+   +---+ +---+ |
 *                    |  initialize                    close    |
 *                    +-----------------------------------------+
 * </pre>
 *
 * Use cases:
 * - Preserving the input selection ranges before/after reconciliation.
 *   Restoring selection even in the event of an unexpected error.
 * - Deactivating events while rearranging the DOM, preventing blurs/focuses,
 *   while guaranteeing that afterwards, the event system is reactivated.
 * - Flushing a queue of collected DOM mutations to the main UI thread after a
 *   reconciliation takes place in a worker thread.
 * - Invoking any collected `componentDidUpdate` callbacks after rendering new
 *   content.
 * - (Future use case): Wrapping particular flushes of the `ReactWorker` queue
 *   to preserve the `scrollTop` (an automatic scroll aware DOM).
 * - (Future use case): Layout calculations before and after DOM upates.
 *
 * Transactional plugin API:
 * - A module that has an `initialize` method that returns any precomputation.
 * - and a `close` method that accepts the precomputation. `close` is invoked
 *   when the wrapped process is completed, or has failed.
 *
 * @param {Array<TransactionalWrapper>} transactionWrapper Wrapper modules
 * that implement `initialize` and `close`.
 * @return {Transaction} Single transaction for reuse in thread.
 *
 * @class Transaction
 */
var Mixin = {
  /**
   * Sets up this instance so that it is prepared for collecting metrics. Does
   * so such that this setup method may be used on an instance that is already
   * initialized, in a way that does not consume additional memory upon reuse.
   * That can be useful if you decide to make your subclass of this mixin a
   * "PooledClass".
   */
  reinitializeTransaction: function() {
    this.transactionWrappers = this.getTransactionWrappers();
    if (!this.wrapperInitData) {
      this.wrapperInitData = [];
    } else {
      this.wrapperInitData.length = 0;
    }
    this._isInTransaction = false;
  },

  _isInTransaction: false,

  /**
   * @abstract
   * @return {Array<TransactionWrapper>} Array of transaction wrappers.
   */
  getTransactionWrappers: null,

  isInTransaction: function() {
    return !!this._isInTransaction;
  },

  /**
   * Executes the function within a safety window. Use this for the top level
   * methods that result in large amounts of computation/mutations that would
   * need to be safety checked.
   *
   * @param {function} method Member of scope to call.
   * @param {Object} scope Scope to invoke from.
   * @param {Object?=} args... Arguments to pass to the method (optional).
   *                           Helps prevent need to bind in many cases.
   * @return Return value from `method`.
   */
  perform: function(method, scope, a, b, c, d, e, f) {
    ("production" !== "development" ? invariant(
      !this.isInTransaction(),
      'Transaction.perform(...): Cannot initialize a transaction when there ' +
      'is already an outstanding transaction.'
    ) : invariant(!this.isInTransaction()));
    var errorThrown;
    var ret;
    try {
      this._isInTransaction = true;
      // Catching errors makes debugging more difficult, so we start with
      // errorThrown set to true before setting it to false after calling
      // close -- if it's still set to true in the finally block, it means
      // one of these calls threw.
      errorThrown = true;
      this.initializeAll(0);
      ret = method.call(scope, a, b, c, d, e, f);
      errorThrown = false;
    } finally {
      try {
        if (errorThrown) {
          // If `method` throws, prefer to show that stack trace over any thrown
          // by invoking `closeAll`.
          try {
            this.closeAll(0);
          } catch (err) {
          }
        } else {
          // Since `method` didn't throw, we don't want to silence the exception
          // here.
          this.closeAll(0);
        }
      } finally {
        this._isInTransaction = false;
      }
    }
    return ret;
  },

  initializeAll: function(startIndex) {
    var transactionWrappers = this.transactionWrappers;
    for (var i = startIndex; i < transactionWrappers.length; i++) {
      var wrapper = transactionWrappers[i];
      try {
        // Catching errors makes debugging more difficult, so we start with the
        // OBSERVED_ERROR state before overwriting it with the real return value
        // of initialize -- if it's still set to OBSERVED_ERROR in the finally
        // block, it means wrapper.initialize threw.
        this.wrapperInitData[i] = Transaction.OBSERVED_ERROR;
        this.wrapperInitData[i] = wrapper.initialize ?
          wrapper.initialize.call(this) :
          null;
      } finally {
        if (this.wrapperInitData[i] === Transaction.OBSERVED_ERROR) {
          // The initializer for wrapper i threw an error; initialize the
          // remaining wrappers but silence any exceptions from them to ensure
          // that the first error is the one to bubble up.
          try {
            this.initializeAll(i + 1);
          } catch (err) {
          }
        }
      }
    }
  },

  /**
   * Invokes each of `this.transactionWrappers.close[i]` functions, passing into
   * them the respective return values of `this.transactionWrappers.init[i]`
   * (`close`rs that correspond to initializers that failed will not be
   * invoked).
   */
  closeAll: function(startIndex) {
    ("production" !== "development" ? invariant(
      this.isInTransaction(),
      'Transaction.closeAll(): Cannot close transaction when none are open.'
    ) : invariant(this.isInTransaction()));
    var transactionWrappers = this.transactionWrappers;
    for (var i = startIndex; i < transactionWrappers.length; i++) {
      var wrapper = transactionWrappers[i];
      var initData = this.wrapperInitData[i];
      var errorThrown;
      try {
        // Catching errors makes debugging more difficult, so we start with
        // errorThrown set to true before setting it to false after calling
        // close -- if it's still set to true in the finally block, it means
        // wrapper.close threw.
        errorThrown = true;
        if (initData !== Transaction.OBSERVED_ERROR) {
          wrapper.close && wrapper.close.call(this, initData);
        }
        errorThrown = false;
      } finally {
        if (errorThrown) {
          // The closer for wrapper i threw an error; close the remaining
          // wrappers but silence any exceptions from them to ensure that the
          // first error is the one to bubble up.
          try {
            this.closeAll(i + 1);
          } catch (e) {
          }
        }
      }
    }
    this.wrapperInitData.length = 0;
  }
};

var Transaction = {

  Mixin: Mixin,

  /**
   * Token to look for to determine if an error occured.
   */
  OBSERVED_ERROR: {}

};

module.exports = Transaction;

},{"./invariant":120}],93:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule ViewportMetrics
 */

"use strict";

var getUnboundedScrollPosition = _dereq_("./getUnboundedScrollPosition");

var ViewportMetrics = {

  currentScrollLeft: 0,

  currentScrollTop: 0,

  refreshScrollValues: function() {
    var scrollPosition = getUnboundedScrollPosition(window);
    ViewportMetrics.currentScrollLeft = scrollPosition.x;
    ViewportMetrics.currentScrollTop = scrollPosition.y;
  }

};

module.exports = ViewportMetrics;

},{"./getUnboundedScrollPosition":116}],94:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule accumulate
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * Accumulates items that must not be null or undefined.
 *
 * This is used to conserve memory by avoiding array allocations.
 *
 * @return {*|array<*>} An accumulation of items.
 */
function accumulate(current, next) {
  ("production" !== "development" ? invariant(
    next != null,
    'accumulate(...): Accumulated items must be not be null or undefined.'
  ) : invariant(next != null));
  if (current == null) {
    return next;
  } else {
    // Both are not empty. Warning: Never call x.concat(y) when you are not
    // certain that x is an Array (x could be a string with concat method).
    var currentIsArray = Array.isArray(current);
    var nextIsArray = Array.isArray(next);
    if (currentIsArray) {
      return current.concat(next);
    } else {
      if (nextIsArray) {
        return [current].concat(next);
      } else {
        return [current, next];
      }
    }
  }
}

module.exports = accumulate;

},{"./invariant":120}],95:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule adler32
 */

/* jslint bitwise:true */

"use strict";

var MOD = 65521;

// This is a clean-room implementation of adler32 designed for detecting
// if markup is not what we expect it to be. It does not need to be
// cryptographically strong, only reasonable good at detecting if markup
// generated on the server is different than that on the client.
function adler32(data) {
  var a = 1;
  var b = 0;
  for (var i = 0; i < data.length; i++) {
    a = (a + data.charCodeAt(i)) % MOD;
    b = (b + a) % MOD;
  }
  return a | (b << 16);
}

module.exports = adler32;

},{}],96:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule containsNode
 * @typechecks
 */

var isTextNode = _dereq_("./isTextNode");

/*jslint bitwise:true */

/**
 * Checks if a given DOM node contains or is another DOM node.
 *
 * @param {?DOMNode} outerNode Outer DOM node.
 * @param {?DOMNode} innerNode Inner DOM node.
 * @return {boolean} True if `outerNode` contains or is `innerNode`.
 */
function containsNode(outerNode, innerNode) {
  if (!outerNode || !innerNode) {
    return false;
  } else if (outerNode === innerNode) {
    return true;
  } else if (isTextNode(outerNode)) {
    return false;
  } else if (isTextNode(innerNode)) {
    return containsNode(outerNode, innerNode.parentNode);
  } else if (outerNode.contains) {
    return outerNode.contains(innerNode);
  } else if (outerNode.compareDocumentPosition) {
    return !!(outerNode.compareDocumentPosition(innerNode) & 16);
  } else {
    return false;
  }
}

module.exports = containsNode;

},{"./isTextNode":124}],97:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule copyProperties
 */

/**
 * Copy properties from one or more objects (up to 5) into the first object.
 * This is a shallow copy. It mutates the first object and also returns it.
 *
 * NOTE: `arguments` has a very significant performance penalty, which is why
 * we don't support unlimited arguments.
 */
function copyProperties(obj, a, b, c, d, e, f) {
  obj = obj || {};

  if ("production" !== "development") {
    if (f) {
      throw new Error('Too many arguments passed to copyProperties');
    }
  }

  var args = [a, b, c, d, e];
  var ii = 0, v;
  while (args[ii]) {
    v = args[ii++];
    for (var k in v) {
      obj[k] = v[k];
    }

    // IE ignores toString in object iteration.. See:
    // webreflection.blogspot.com/2007/07/quick-fix-internet-explorer-and.html
    if (v.hasOwnProperty && v.hasOwnProperty('toString') &&
        (typeof v.toString != 'undefined') && (obj.toString !== v.toString)) {
      obj.toString = v.toString;
    }
  }

  return obj;
}

module.exports = copyProperties;

},{}],98:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule createArrayFrom
 * @typechecks
 */

var toArray = _dereq_("./toArray");

/**
 * Perform a heuristic test to determine if an object is "array-like".
 *
 *   A monk asked Joshu, a Zen master, "Has a dog Buddha nature?"
 *   Joshu replied: "Mu."
 *
 * This function determines if its argument has "array nature": it returns
 * true if the argument is an actual array, an `arguments' object, or an
 * HTMLCollection (e.g. node.childNodes or node.getElementsByTagName()).
 *
 * It will return false for other array-like objects like Filelist.
 *
 * @param {*} obj
 * @return {boolean}
 */
function hasArrayNature(obj) {
  return (
    // not null/false
    !!obj &&
    // arrays are objects, NodeLists are functions in Safari
    (typeof obj == 'object' || typeof obj == 'function') &&
    // quacks like an array
    ('length' in obj) &&
    // not window
    !('setInterval' in obj) &&
    // no DOM node should be considered an array-like
    // a 'select' element has 'length' and 'item' properties on IE8
    (typeof obj.nodeType != 'number') &&
    (
      // a real array
      (// HTMLCollection/NodeList
      (Array.isArray(obj) ||
      // arguments
      ('callee' in obj) || 'item' in obj))
    )
  );
}

/**
 * Ensure that the argument is an array by wrapping it in an array if it is not.
 * Creates a copy of the argument if it is already an array.
 *
 * This is mostly useful idiomatically:
 *
 *   var createArrayFrom = require('createArrayFrom');
 *
 *   function takesOneOrMoreThings(things) {
 *     things = createArrayFrom(things);
 *     ...
 *   }
 *
 * This allows you to treat `things' as an array, but accept scalars in the API.
 *
 * If you need to convert an array-like object, like `arguments`, into an array
 * use toArray instead.
 *
 * @param {*} obj
 * @return {array}
 */
function createArrayFrom(obj) {
  if (!hasArrayNature(obj)) {
    return [obj];
  } else if (Array.isArray(obj)) {
    return obj.slice();
  } else {
    return toArray(obj);
  }
}

module.exports = createArrayFrom;

},{"./toArray":141}],99:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule createFullPageComponent
 * @typechecks
 */

"use strict";

// Defeat circular references by requiring this directly.
var ReactCompositeComponent = _dereq_("./ReactCompositeComponent");

var invariant = _dereq_("./invariant");

/**
 * Create a component that will throw an exception when unmounted.
 *
 * Components like <html> <head> and <body> can't be removed or added
 * easily in a cross-browser way, however it's valuable to be able to
 * take advantage of React's reconciliation for styling and <title>
 * management. So we just document it and throw in dangerous cases.
 *
 * @param {function} componentClass convenience constructor to wrap
 * @return {function} convenience constructor of new component
 */
function createFullPageComponent(componentClass) {
  var FullPageComponent = ReactCompositeComponent.createClass({
    displayName: 'ReactFullPageComponent' + (
      componentClass.type.displayName || ''
    ),

    componentWillUnmount: function() {
      ("production" !== "development" ? invariant(
        false,
        '%s tried to unmount. Because of cross-browser quirks it is ' +
        'impossible to unmount some top-level components (eg <html>, <head>, ' +
        'and <body>) reliably and efficiently. To fix this, have a single ' +
        'top-level component that never unmounts render these elements.',
        this.constructor.displayName
      ) : invariant(false));
    },

    render: function() {
      return this.transferPropsTo(componentClass(null, this.props.children));
    }
  });

  return FullPageComponent;
}

module.exports = createFullPageComponent;

},{"./ReactCompositeComponent":33,"./invariant":120}],100:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule createNodesFromMarkup
 * @typechecks
 */

/*jslint evil: true, sub: true */

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var createArrayFrom = _dereq_("./createArrayFrom");
var getMarkupWrap = _dereq_("./getMarkupWrap");
var invariant = _dereq_("./invariant");

/**
 * Dummy container used to render all markup.
 */
var dummyNode =
  ExecutionEnvironment.canUseDOM ? document.createElement('div') : null;

/**
 * Pattern used by `getNodeName`.
 */
var nodeNamePattern = /^\s*<(\w+)/;

/**
 * Extracts the `nodeName` of the first element in a string of markup.
 *
 * @param {string} markup String of markup.
 * @return {?string} Node name of the supplied markup.
 */
function getNodeName(markup) {
  var nodeNameMatch = markup.match(nodeNamePattern);
  return nodeNameMatch && nodeNameMatch[1].toLowerCase();
}

/**
 * Creates an array containing the nodes rendered from the supplied markup. The
 * optionally supplied `handleScript` function will be invoked once for each
 * <script> element that is rendered. If no `handleScript` function is supplied,
 * an exception is thrown if any <script> elements are rendered.
 *
 * @param {string} markup A string of valid HTML markup.
 * @param {?function} handleScript Invoked once for each rendered <script>.
 * @return {array<DOMElement|DOMTextNode>} An array of rendered nodes.
 */
function createNodesFromMarkup(markup, handleScript) {
  var node = dummyNode;
  ("production" !== "development" ? invariant(!!dummyNode, 'createNodesFromMarkup dummy not initialized') : invariant(!!dummyNode));
  var nodeName = getNodeName(markup);

  var wrap = nodeName && getMarkupWrap(nodeName);
  if (wrap) {
    node.innerHTML = wrap[1] + markup + wrap[2];

    var wrapDepth = wrap[0];
    while (wrapDepth--) {
      node = node.lastChild;
    }
  } else {
    node.innerHTML = markup;
  }

  var scripts = node.getElementsByTagName('script');
  if (scripts.length) {
    ("production" !== "development" ? invariant(
      handleScript,
      'createNodesFromMarkup(...): Unexpected <script> element rendered.'
    ) : invariant(handleScript));
    createArrayFrom(scripts).forEach(handleScript);
  }

  var nodes = createArrayFrom(node.childNodes);
  while (node.lastChild) {
    node.removeChild(node.lastChild);
  }
  return nodes;
}

module.exports = createNodesFromMarkup;

},{"./ExecutionEnvironment":21,"./createArrayFrom":98,"./getMarkupWrap":112,"./invariant":120}],101:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule dangerousStyleValue
 * @typechecks static-only
 */

"use strict";

var CSSProperty = _dereq_("./CSSProperty");

var isUnitlessNumber = CSSProperty.isUnitlessNumber;

/**
 * Convert a value into the proper css writable value. The style name `name`
 * should be logical (no hyphens), as specified
 * in `CSSProperty.isUnitlessNumber`.
 *
 * @param {string} name CSS property name such as `topMargin`.
 * @param {*} value CSS property value such as `10px`.
 * @return {string} Normalized style value with dimensions applied.
 */
function dangerousStyleValue(name, value) {
  // Note that we've removed escapeTextForBrowser() calls here since the
  // whole string will be escaped when the attribute is injected into
  // the markup. If you provide unsafe user data here they can inject
  // arbitrary CSS which may be problematic (I couldn't repro this):
  // https://www.owasp.org/index.php/XSS_Filter_Evasion_Cheat_Sheet
  // http://www.thespanner.co.uk/2007/11/26/ultimate-xss-css-injection/
  // This is not an XSS hole but instead a potential CSS injection issue
  // which has lead to a greater discussion about how we're going to
  // trust URLs moving forward. See #2115901

  var isEmpty = value == null || typeof value === 'boolean' || value === '';
  if (isEmpty) {
    return '';
  }

  var isNonNumeric = isNaN(value);
  if (isNonNumeric || value === 0 ||
      isUnitlessNumber.hasOwnProperty(name) && isUnitlessNumber[name]) {
    return '' + value; // cast to string
  }

  if (typeof value === 'string') {
    value = value.trim();
  }
  return value + 'px';
}

module.exports = dangerousStyleValue;

},{"./CSSProperty":3}],102:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule emptyFunction
 */

var copyProperties = _dereq_("./copyProperties");

function makeEmptyFunction(arg) {
  return function() {
    return arg;
  };
}

/**
 * This function accepts and discards inputs; it has no side effects. This is
 * primarily useful idiomatically for overridable function endpoints which
 * always need to be callable, since JS lacks a null-call idiom ala Cocoa.
 */
function emptyFunction() {}

copyProperties(emptyFunction, {
  thatReturns: makeEmptyFunction,
  thatReturnsFalse: makeEmptyFunction(false),
  thatReturnsTrue: makeEmptyFunction(true),
  thatReturnsNull: makeEmptyFunction(null),
  thatReturnsThis: function() { return this; },
  thatReturnsArgument: function(arg) { return arg; }
});

module.exports = emptyFunction;

},{"./copyProperties":97}],103:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule emptyObject
 */

"use strict";

var emptyObject = {};

if ("production" !== "development") {
  Object.freeze(emptyObject);
}

module.exports = emptyObject;

},{}],104:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule escapeTextForBrowser
 * @typechecks static-only
 */

"use strict";

var ESCAPE_LOOKUP = {
  "&": "&amp;",
  ">": "&gt;",
  "<": "&lt;",
  "\"": "&quot;",
  "'": "&#x27;"
};

var ESCAPE_REGEX = /[&><"']/g;

function escaper(match) {
  return ESCAPE_LOOKUP[match];
}

/**
 * Escapes text to prevent scripting attacks.
 *
 * @param {*} text Text value to escape.
 * @return {string} An escaped string.
 */
function escapeTextForBrowser(text) {
  return ('' + text).replace(ESCAPE_REGEX, escaper);
}

module.exports = escapeTextForBrowser;

},{}],105:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule flattenChildren
 */

"use strict";

var traverseAllChildren = _dereq_("./traverseAllChildren");
var warning = _dereq_("./warning");

/**
 * @param {function} traverseContext Context passed through traversal.
 * @param {?ReactComponent} child React child component.
 * @param {!string} name String name of key path to child.
 */
function flattenSingleChildIntoContext(traverseContext, child, name) {
  // We found a component instance.
  var result = traverseContext;
  var keyUnique = !result.hasOwnProperty(name);
  ("production" !== "development" ? warning(
    keyUnique,
    'flattenChildren(...): Encountered two children with the same key, ' +
    '`%s`. Child keys must be unique; when two children share a key, only ' +
    'the first child will be used.',
    name
  ) : null);
  if (keyUnique && child != null) {
    result[name] = child;
  }
}

/**
 * Flattens children that are typically specified as `props.children`. Any null
 * children will not be included in the resulting object.
 * @return {!object} flattened children keyed by name.
 */
function flattenChildren(children) {
  if (children == null) {
    return children;
  }
  var result = {};
  traverseAllChildren(children, flattenSingleChildIntoContext, result);
  return result;
}

module.exports = flattenChildren;

},{"./traverseAllChildren":142,"./warning":143}],106:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule focusNode
 */

"use strict";

/**
 * IE8 throws if an input/textarea is disabled and we try to focus it.
 * Focus only when necessary.
 *
 * @param {DOMElement} node input/textarea to focus
 */
function focusNode(node) {
  if (!node.disabled) {
    node.focus();
  }
}

module.exports = focusNode;

},{}],107:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule forEachAccumulated
 */

"use strict";

/**
 * @param {array} an "accumulation" of items which is either an Array or
 * a single item. Useful when paired with the `accumulate` module. This is a
 * simple utility that allows us to reason about a collection of items, but
 * handling the case when there is exactly one item (and we do not need to
 * allocate an array).
 */
var forEachAccumulated = function(arr, cb, scope) {
  if (Array.isArray(arr)) {
    arr.forEach(cb, scope);
  } else if (arr) {
    cb.call(scope, arr);
  }
};

module.exports = forEachAccumulated;

},{}],108:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getActiveElement
 * @typechecks
 */

/**
 * Same as document.activeElement but wraps in a try-catch block. In IE it is
 * not safe to call document.activeElement if there is nothing focused.
 *
 * The activeElement will be null only if the document body is not yet defined.
 */
function getActiveElement() /*?DOMElement*/ {
  try {
    return document.activeElement || document.body;
  } catch (e) {
    return document.body;
  }
}

module.exports = getActiveElement;

},{}],109:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getEventKey
 * @typechecks static-only
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * Normalization of deprecated HTML5 `key` values
 * @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent#Key_names
 */
var normalizeKey = {
  'Esc': 'Escape',
  'Spacebar': ' ',
  'Left': 'ArrowLeft',
  'Up': 'ArrowUp',
  'Right': 'ArrowRight',
  'Down': 'ArrowDown',
  'Del': 'Delete',
  'Win': 'OS',
  'Menu': 'ContextMenu',
  'Apps': 'ContextMenu',
  'Scroll': 'ScrollLock',
  'MozPrintableKey': 'Unidentified'
};

/**
 * Translation from legacy `which`/`keyCode` to HTML5 `key`
 * Only special keys supported, all others depend on keyboard layout or browser
 * @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent#Key_names
 */
var translateToKey = {
  8: 'Backspace',
  9: 'Tab',
  12: 'Clear',
  13: 'Enter',
  16: 'Shift',
  17: 'Control',
  18: 'Alt',
  19: 'Pause',
  20: 'CapsLock',
  27: 'Escape',
  32: ' ',
  33: 'PageUp',
  34: 'PageDown',
  35: 'End',
  36: 'Home',
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown',
  45: 'Insert',
  46: 'Delete',
  112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4', 116: 'F5', 117: 'F6',
  118: 'F7', 119: 'F8', 120: 'F9', 121: 'F10', 122: 'F11', 123: 'F12',
  144: 'NumLock',
  145: 'ScrollLock',
  224: 'Meta'
};

/**
 * @param {object} nativeEvent Native browser event.
 * @return {string} Normalized `key` property.
 */
function getEventKey(nativeEvent) {
  if (nativeEvent.key) {
    // Normalize inconsistent values reported by browsers due to
    // implementations of a working draft specification.

    // FireFox implements `key` but returns `MozPrintableKey` for all
    // printable characters (normalized to `Unidentified`), ignore it.
    var key = normalizeKey[nativeEvent.key] || nativeEvent.key;
    if (key !== 'Unidentified') {
      return key;
    }
  }

  // Browser does not implement `key`, polyfill as much of it as we can.
  if (nativeEvent.type === 'keypress') {
    // Create the character from the `charCode` ourselves and use as an almost
    // perfect replacement.
    var charCode = 'charCode' in nativeEvent ?
      nativeEvent.charCode :
      nativeEvent.keyCode;

    // The enter-key is technically both printable and non-printable and can
    // thus be captured by `keypress`, no other non-printable key should.
    return charCode === 13 ? 'Enter' : String.fromCharCode(charCode);
  }
  if (nativeEvent.type === 'keydown' || nativeEvent.type === 'keyup') {
    // While user keyboard layout determines the actual meaning of each
    // `keyCode` value, almost all function keys have a universal value.
    return translateToKey[nativeEvent.keyCode] || 'Unidentified';
  }

  ("production" !== "development" ? invariant(false, "Unexpected keyboard event type: %s", nativeEvent.type) : invariant(false));
}

module.exports = getEventKey;

},{"./invariant":120}],110:[function(_dereq_,module,exports){
/**
 * Copyright 2013 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getEventModifierState
 * @typechecks static-only
 */

"use strict";

/**
 * Translation from modifier key to the associated property in the event.
 * @see http://www.w3.org/TR/DOM-Level-3-Events/#keys-Modifiers
 */

var modifierKeyToProp = {
  'Alt': 'altKey',
  'Control': 'ctrlKey',
  'Meta': 'metaKey',
  'Shift': 'shiftKey'
};

// IE8 does not implement getModifierState so we simply map it to the only
// modifier keys exposed by the event itself, does not support Lock-keys.
// Currently, all major browsers except Chrome seems to support Lock-keys.
function modifierStateGetter(keyArg) {
  /*jshint validthis:true */
  var syntheticEvent = this;
  var nativeEvent = syntheticEvent.nativeEvent;
  if (nativeEvent.getModifierState) {
    return nativeEvent.getModifierState(keyArg);
  }
  var keyProp = modifierKeyToProp[keyArg];
  return keyProp ? !!nativeEvent[keyProp] : false;
}

function getEventModifierState(nativeEvent) {
  return modifierStateGetter;
}

module.exports = getEventModifierState;

},{}],111:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getEventTarget
 * @typechecks static-only
 */

"use strict";

/**
 * Gets the target node from a native browser event by accounting for
 * inconsistencies in browser DOM APIs.
 *
 * @param {object} nativeEvent Native browser event.
 * @return {DOMEventTarget} Target node.
 */
function getEventTarget(nativeEvent) {
  var target = nativeEvent.target || nativeEvent.srcElement || window;
  // Safari may fire events on text nodes (Node.TEXT_NODE is 3).
  // @see http://www.quirksmode.org/js/events_properties.html
  return target.nodeType === 3 ? target.parentNode : target;
}

module.exports = getEventTarget;

},{}],112:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getMarkupWrap
 */

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var invariant = _dereq_("./invariant");

/**
 * Dummy container used to detect which wraps are necessary.
 */
var dummyNode =
  ExecutionEnvironment.canUseDOM ? document.createElement('div') : null;

/**
 * Some browsers cannot use `innerHTML` to render certain elements standalone,
 * so we wrap them, render the wrapped nodes, then extract the desired node.
 *
 * In IE8, certain elements cannot render alone, so wrap all elements ('*').
 */
var shouldWrap = {
  // Force wrapping for SVG elements because if they get created inside a <div>,
  // they will be initialized in the wrong namespace (and will not display).
  'circle': true,
  'defs': true,
  'ellipse': true,
  'g': true,
  'line': true,
  'linearGradient': true,
  'path': true,
  'polygon': true,
  'polyline': true,
  'radialGradient': true,
  'rect': true,
  'stop': true,
  'text': true
};

var selectWrap = [1, '<select multiple="true">', '</select>'];
var tableWrap = [1, '<table>', '</table>'];
var trWrap = [3, '<table><tbody><tr>', '</tr></tbody></table>'];

var svgWrap = [1, '<svg>', '</svg>'];

var markupWrap = {
  '*': [1, '?<div>', '</div>'],

  'area': [1, '<map>', '</map>'],
  'col': [2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'],
  'legend': [1, '<fieldset>', '</fieldset>'],
  'param': [1, '<object>', '</object>'],
  'tr': [2, '<table><tbody>', '</tbody></table>'],

  'optgroup': selectWrap,
  'option': selectWrap,

  'caption': tableWrap,
  'colgroup': tableWrap,
  'tbody': tableWrap,
  'tfoot': tableWrap,
  'thead': tableWrap,

  'td': trWrap,
  'th': trWrap,

  'circle': svgWrap,
  'defs': svgWrap,
  'ellipse': svgWrap,
  'g': svgWrap,
  'line': svgWrap,
  'linearGradient': svgWrap,
  'path': svgWrap,
  'polygon': svgWrap,
  'polyline': svgWrap,
  'radialGradient': svgWrap,
  'rect': svgWrap,
  'stop': svgWrap,
  'text': svgWrap
};

/**
 * Gets the markup wrap configuration for the supplied `nodeName`.
 *
 * NOTE: This lazily detects which wraps are necessary for the current browser.
 *
 * @param {string} nodeName Lowercase `nodeName`.
 * @return {?array} Markup wrap configuration, if applicable.
 */
function getMarkupWrap(nodeName) {
  ("production" !== "development" ? invariant(!!dummyNode, 'Markup wrapping node not initialized') : invariant(!!dummyNode));
  if (!markupWrap.hasOwnProperty(nodeName)) {
    nodeName = '*';
  }
  if (!shouldWrap.hasOwnProperty(nodeName)) {
    if (nodeName === '*') {
      dummyNode.innerHTML = '<link />';
    } else {
      dummyNode.innerHTML = '<' + nodeName + '></' + nodeName + '>';
    }
    shouldWrap[nodeName] = !dummyNode.firstChild;
  }
  return shouldWrap[nodeName] ? markupWrap[nodeName] : null;
}


module.exports = getMarkupWrap;

},{"./ExecutionEnvironment":21,"./invariant":120}],113:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getNodeForCharacterOffset
 */

"use strict";

/**
 * Given any node return the first leaf node without children.
 *
 * @param {DOMElement|DOMTextNode} node
 * @return {DOMElement|DOMTextNode}
 */
function getLeafNode(node) {
  while (node && node.firstChild) {
    node = node.firstChild;
  }
  return node;
}

/**
 * Get the next sibling within a container. This will walk up the
 * DOM if a node's siblings have been exhausted.
 *
 * @param {DOMElement|DOMTextNode} node
 * @return {?DOMElement|DOMTextNode}
 */
function getSiblingNode(node) {
  while (node) {
    if (node.nextSibling) {
      return node.nextSibling;
    }
    node = node.parentNode;
  }
}

/**
 * Get object describing the nodes which contain characters at offset.
 *
 * @param {DOMElement|DOMTextNode} root
 * @param {number} offset
 * @return {?object}
 */
function getNodeForCharacterOffset(root, offset) {
  var node = getLeafNode(root);
  var nodeStart = 0;
  var nodeEnd = 0;

  while (node) {
    if (node.nodeType == 3) {
      nodeEnd = nodeStart + node.textContent.length;

      if (nodeStart <= offset && nodeEnd >= offset) {
        return {
          node: node,
          offset: offset - nodeStart
        };
      }

      nodeStart = nodeEnd;
    }

    node = getLeafNode(getSiblingNode(node));
  }
}

module.exports = getNodeForCharacterOffset;

},{}],114:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getReactRootElementInContainer
 */

"use strict";

var DOC_NODE_TYPE = 9;

/**
 * @param {DOMElement|DOMDocument} container DOM element that may contain
 *                                           a React component
 * @return {?*} DOM element that may have the reactRoot ID, or null.
 */
function getReactRootElementInContainer(container) {
  if (!container) {
    return null;
  }

  if (container.nodeType === DOC_NODE_TYPE) {
    return container.documentElement;
  } else {
    return container.firstChild;
  }
}

module.exports = getReactRootElementInContainer;

},{}],115:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getTextContentAccessor
 */

"use strict";

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var contentKey = null;

/**
 * Gets the key used to access text content on a DOM node.
 *
 * @return {?string} Key used to access text content.
 * @internal
 */
function getTextContentAccessor() {
  if (!contentKey && ExecutionEnvironment.canUseDOM) {
    // Prefer textContent to innerText because many browsers support both but
    // SVG <text> elements don't support innerText even when <div> does.
    contentKey = 'textContent' in document.documentElement ?
      'textContent' :
      'innerText';
  }
  return contentKey;
}

module.exports = getTextContentAccessor;

},{"./ExecutionEnvironment":21}],116:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule getUnboundedScrollPosition
 * @typechecks
 */

"use strict";

/**
 * Gets the scroll position of the supplied element or window.
 *
 * The return values are unbounded, unlike `getScrollPosition`. This means they
 * may be negative or exceed the element boundaries (which is possible using
 * inertial scrolling).
 *
 * @param {DOMWindow|DOMElement} scrollable
 * @return {object} Map with `x` and `y` keys.
 */
function getUnboundedScrollPosition(scrollable) {
  if (scrollable === window) {
    return {
      x: window.pageXOffset || document.documentElement.scrollLeft,
      y: window.pageYOffset || document.documentElement.scrollTop
    };
  }
  return {
    x: scrollable.scrollLeft,
    y: scrollable.scrollTop
  };
}

module.exports = getUnboundedScrollPosition;

},{}],117:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule hyphenate
 * @typechecks
 */

var _uppercasePattern = /([A-Z])/g;

/**
 * Hyphenates a camelcased string, for example:
 *
 *   > hyphenate('backgroundColor')
 *   < "background-color"
 *
 * For CSS style names, use `hyphenateStyleName` instead which works properly
 * with all vendor prefixes, including `ms`.
 *
 * @param {string} string
 * @return {string}
 */
function hyphenate(string) {
  return string.replace(_uppercasePattern, '-$1').toLowerCase();
}

module.exports = hyphenate;

},{}],118:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule hyphenateStyleName
 * @typechecks
 */

"use strict";

var hyphenate = _dereq_("./hyphenate");

var msPattern = /^ms-/;

/**
 * Hyphenates a camelcased CSS property name, for example:
 *
 *   > hyphenate('backgroundColor')
 *   < "background-color"
 *   > hyphenate('MozTransition')
 *   < "-moz-transition"
 *   > hyphenate('msTransition')
 *   < "-ms-transition"
 *
 * As Modernizr suggests (http://modernizr.com/docs/#prefixed), an `ms` prefix
 * is converted to `-ms-`.
 *
 * @param {string} string
 * @return {string}
 */
function hyphenateStyleName(string) {
  return hyphenate(string).replace(msPattern, '-ms-');
}

module.exports = hyphenateStyleName;

},{"./hyphenate":117}],119:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule instantiateReactComponent
 * @typechecks static-only
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * Validate a `componentDescriptor`. This should be exposed publicly in a follow
 * up diff.
 *
 * @param {object} descriptor
 * @return {boolean} Returns true if this is a valid descriptor of a Component.
 */
function isValidComponentDescriptor(descriptor) {
  return (
    descriptor &&
    typeof descriptor.type === 'function' &&
    typeof descriptor.type.prototype.mountComponent === 'function' &&
    typeof descriptor.type.prototype.receiveComponent === 'function'
  );
}

/**
 * Given a `componentDescriptor` create an instance that will actually be
 * mounted. Currently it just extracts an existing clone from composite
 * components but this is an implementation detail which will change.
 *
 * @param {object} descriptor
 * @return {object} A new instance of componentDescriptor's constructor.
 * @protected
 */
function instantiateReactComponent(descriptor) {

  // TODO: Make warning
  // if (__DEV__) {
    ("production" !== "development" ? invariant(
      isValidComponentDescriptor(descriptor),
      'Only React Components are valid for mounting.'
    ) : invariant(isValidComponentDescriptor(descriptor)));
  // }

  return new descriptor.type(descriptor);
}

module.exports = instantiateReactComponent;

},{"./invariant":120}],120:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule invariant
 */

"use strict";

/**
 * Use invariant() to assert state which your program assumes to be true.
 *
 * Provide sprintf-style format (only %s is supported) and arguments
 * to provide information about what broke and what you were
 * expecting.
 *
 * The invariant message will be stripped in production, but the invariant
 * will remain to ensure logic does not differ in production.
 */

var invariant = function(condition, format, a, b, c, d, e, f) {
  if ("production" !== "development") {
    if (format === undefined) {
      throw new Error('invariant requires an error message argument');
    }
  }

  if (!condition) {
    var error;
    if (format === undefined) {
      error = new Error(
        'Minified exception occurred; use the non-minified dev environment ' +
        'for the full error message and additional helpful warnings.'
      );
    } else {
      var args = [a, b, c, d, e, f];
      var argIndex = 0;
      error = new Error(
        'Invariant Violation: ' +
        format.replace(/%s/g, function() { return args[argIndex++]; })
      );
    }

    error.framesToPop = 1; // we don't care about invariant's own frame
    throw error;
  }
};

module.exports = invariant;

},{}],121:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule isEventSupported
 */

"use strict";

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var useHasFeature;
if (ExecutionEnvironment.canUseDOM) {
  useHasFeature =
    document.implementation &&
    document.implementation.hasFeature &&
    // always returns true in newer browsers as per the standard.
    // @see http://dom.spec.whatwg.org/#dom-domimplementation-hasfeature
    document.implementation.hasFeature('', '') !== true;
}

/**
 * Checks if an event is supported in the current execution environment.
 *
 * NOTE: This will not work correctly for non-generic events such as `change`,
 * `reset`, `load`, `error`, and `select`.
 *
 * Borrows from Modernizr.
 *
 * @param {string} eventNameSuffix Event name, e.g. "click".
 * @param {?boolean} capture Check if the capture phase is supported.
 * @return {boolean} True if the event is supported.
 * @internal
 * @license Modernizr 3.0.0pre (Custom Build) | MIT
 */
function isEventSupported(eventNameSuffix, capture) {
  if (!ExecutionEnvironment.canUseDOM ||
      capture && !('addEventListener' in document)) {
    return false;
  }

  var eventName = 'on' + eventNameSuffix;
  var isSupported = eventName in document;

  if (!isSupported) {
    var element = document.createElement('div');
    element.setAttribute(eventName, 'return;');
    isSupported = typeof element[eventName] === 'function';
  }

  if (!isSupported && useHasFeature && eventNameSuffix === 'wheel') {
    // This is the only way to test support for the `wheel` event in IE9+.
    isSupported = document.implementation.hasFeature('Events.wheel', '3.0');
  }

  return isSupported;
}

module.exports = isEventSupported;

},{"./ExecutionEnvironment":21}],122:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule isNode
 * @typechecks
 */

/**
 * @param {*} object The object to check.
 * @return {boolean} Whether or not the object is a DOM node.
 */
function isNode(object) {
  return !!(object && (
    typeof Node === 'function' ? object instanceof Node :
      typeof object === 'object' &&
      typeof object.nodeType === 'number' &&
      typeof object.nodeName === 'string'
  ));
}

module.exports = isNode;

},{}],123:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule isTextInputElement
 */

"use strict";

/**
 * @see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-input-element.html#input-type-attr-summary
 */
var supportedInputTypes = {
  'color': true,
  'date': true,
  'datetime': true,
  'datetime-local': true,
  'email': true,
  'month': true,
  'number': true,
  'password': true,
  'range': true,
  'search': true,
  'tel': true,
  'text': true,
  'time': true,
  'url': true,
  'week': true
};

function isTextInputElement(elem) {
  return elem && (
    (elem.nodeName === 'INPUT' && supportedInputTypes[elem.type]) ||
    elem.nodeName === 'TEXTAREA'
  );
}

module.exports = isTextInputElement;

},{}],124:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule isTextNode
 * @typechecks
 */

var isNode = _dereq_("./isNode");

/**
 * @param {*} object The object to check.
 * @return {boolean} Whether or not the object is a DOM text node.
 */
function isTextNode(object) {
  return isNode(object) && object.nodeType == 3;
}

module.exports = isTextNode;

},{"./isNode":122}],125:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule joinClasses
 * @typechecks static-only
 */

"use strict";

/**
 * Combines multiple className strings into one.
 * http://jsperf.com/joinclasses-args-vs-array
 *
 * @param {...?string} classes
 * @return {string}
 */
function joinClasses(className/*, ... */) {
  if (!className) {
    className = '';
  }
  var nextClass;
  var argLength = arguments.length;
  if (argLength > 1) {
    for (var ii = 1; ii < argLength; ii++) {
      nextClass = arguments[ii];
      nextClass && (className += ' ' + nextClass);
    }
  }
  return className;
}

module.exports = joinClasses;

},{}],126:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule keyMirror
 * @typechecks static-only
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * Constructs an enumeration with keys equal to their value.
 *
 * For example:
 *
 *   var COLORS = keyMirror({blue: null, red: null});
 *   var myColor = COLORS.blue;
 *   var isColorValid = !!COLORS[myColor];
 *
 * The last line could not be performed if the values of the generated enum were
 * not equal to their keys.
 *
 *   Input:  {key1: val1, key2: val2}
 *   Output: {key1: key1, key2: key2}
 *
 * @param {object} obj
 * @return {object}
 */
var keyMirror = function(obj) {
  var ret = {};
  var key;
  ("production" !== "development" ? invariant(
    obj instanceof Object && !Array.isArray(obj),
    'keyMirror(...): Argument must be an object.'
  ) : invariant(obj instanceof Object && !Array.isArray(obj)));
  for (key in obj) {
    if (!obj.hasOwnProperty(key)) {
      continue;
    }
    ret[key] = key;
  }
  return ret;
};

module.exports = keyMirror;

},{"./invariant":120}],127:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule keyOf
 */

/**
 * Allows extraction of a minified key. Let's the build system minify keys
 * without loosing the ability to dynamically use key strings as values
 * themselves. Pass in an object with a single key/val pair and it will return
 * you the string key of that single record. Suppose you want to grab the
 * value for a key 'className' inside of an object. Key/val minification may
 * have aliased that key to be 'xa12'. keyOf({className: null}) will return
 * 'xa12' in that case. Resolve keys you want to use once at startup time, then
 * reuse those resolutions.
 */
var keyOf = function(oneKeyObj) {
  var key;
  for (key in oneKeyObj) {
    if (!oneKeyObj.hasOwnProperty(key)) {
      continue;
    }
    return key;
  }
  return null;
};


module.exports = keyOf;

},{}],128:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule mapObject
 */

"use strict";

/**
 * For each key/value pair, invokes callback func and constructs a resulting
 * object which contains, for every key in obj, values that are the result of
 * of invoking the function:
 *
 *   func(value, key, iteration)
 *
 * Grepable names:
 *
 *   function objectMap()
 *   function objMap()
 *
 * @param {?object} obj Object to map keys over
 * @param {function} func Invoked for each key/val pair.
 * @param {?*} context
 * @return {?object} Result of mapping or null if obj is falsey
 */
function mapObject(obj, func, context) {
  if (!obj) {
    return null;
  }
  var i = 0;
  var ret = {};
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      ret[key] = func.call(context, obj[key], key, i++);
    }
  }
  return ret;
}

module.exports = mapObject;

},{}],129:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule memoizeStringOnly
 * @typechecks static-only
 */

"use strict";

/**
 * Memoizes the return value of a function that accepts one string argument.
 *
 * @param {function} callback
 * @return {function}
 */
function memoizeStringOnly(callback) {
  var cache = {};
  return function(string) {
    if (cache.hasOwnProperty(string)) {
      return cache[string];
    } else {
      return cache[string] = callback.call(this, string);
    }
  };
}

module.exports = memoizeStringOnly;

},{}],130:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule merge
 */

"use strict";

var mergeInto = _dereq_("./mergeInto");

/**
 * Shallow merges two structures into a return value, without mutating either.
 *
 * @param {?object} one Optional object with properties to merge from.
 * @param {?object} two Optional object with properties to merge from.
 * @return {object} The shallow extension of one by two.
 */
var merge = function(one, two) {
  var result = {};
  mergeInto(result, one);
  mergeInto(result, two);
  return result;
};

module.exports = merge;

},{"./mergeInto":132}],131:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule mergeHelpers
 *
 * requiresPolyfills: Array.isArray
 */

"use strict";

var invariant = _dereq_("./invariant");
var keyMirror = _dereq_("./keyMirror");

/**
 * Maximum number of levels to traverse. Will catch circular structures.
 * @const
 */
var MAX_MERGE_DEPTH = 36;

/**
 * We won't worry about edge cases like new String('x') or new Boolean(true).
 * Functions are considered terminals, and arrays are not.
 * @param {*} o The item/object/value to test.
 * @return {boolean} true iff the argument is a terminal.
 */
var isTerminal = function(o) {
  return typeof o !== 'object' || o === null;
};

var mergeHelpers = {

  MAX_MERGE_DEPTH: MAX_MERGE_DEPTH,

  isTerminal: isTerminal,

  /**
   * Converts null/undefined values into empty object.
   *
   * @param {?Object=} arg Argument to be normalized (nullable optional)
   * @return {!Object}
   */
  normalizeMergeArg: function(arg) {
    return arg === undefined || arg === null ? {} : arg;
  },

  /**
   * If merging Arrays, a merge strategy *must* be supplied. If not, it is
   * likely the caller's fault. If this function is ever called with anything
   * but `one` and `two` being `Array`s, it is the fault of the merge utilities.
   *
   * @param {*} one Array to merge into.
   * @param {*} two Array to merge from.
   */
  checkMergeArrayArgs: function(one, two) {
    ("production" !== "development" ? invariant(
      Array.isArray(one) && Array.isArray(two),
      'Tried to merge arrays, instead got %s and %s.',
      one,
      two
    ) : invariant(Array.isArray(one) && Array.isArray(two)));
  },

  /**
   * @param {*} one Object to merge into.
   * @param {*} two Object to merge from.
   */
  checkMergeObjectArgs: function(one, two) {
    mergeHelpers.checkMergeObjectArg(one);
    mergeHelpers.checkMergeObjectArg(two);
  },

  /**
   * @param {*} arg
   */
  checkMergeObjectArg: function(arg) {
    ("production" !== "development" ? invariant(
      !isTerminal(arg) && !Array.isArray(arg),
      'Tried to merge an object, instead got %s.',
      arg
    ) : invariant(!isTerminal(arg) && !Array.isArray(arg)));
  },

  /**
   * @param {*} arg
   */
  checkMergeIntoObjectArg: function(arg) {
    ("production" !== "development" ? invariant(
      (!isTerminal(arg) || typeof arg === 'function') && !Array.isArray(arg),
      'Tried to merge into an object, instead got %s.',
      arg
    ) : invariant((!isTerminal(arg) || typeof arg === 'function') && !Array.isArray(arg)));
  },

  /**
   * Checks that a merge was not given a circular object or an object that had
   * too great of depth.
   *
   * @param {number} Level of recursion to validate against maximum.
   */
  checkMergeLevel: function(level) {
    ("production" !== "development" ? invariant(
      level < MAX_MERGE_DEPTH,
      'Maximum deep merge depth exceeded. You may be attempting to merge ' +
      'circular structures in an unsupported way.'
    ) : invariant(level < MAX_MERGE_DEPTH));
  },

  /**
   * Checks that the supplied merge strategy is valid.
   *
   * @param {string} Array merge strategy.
   */
  checkArrayStrategy: function(strategy) {
    ("production" !== "development" ? invariant(
      strategy === undefined || strategy in mergeHelpers.ArrayStrategies,
      'You must provide an array strategy to deep merge functions to ' +
      'instruct the deep merge how to resolve merging two arrays.'
    ) : invariant(strategy === undefined || strategy in mergeHelpers.ArrayStrategies));
  },

  /**
   * Set of possible behaviors of merge algorithms when encountering two Arrays
   * that must be merged together.
   * - `clobber`: The left `Array` is ignored.
   * - `indexByIndex`: The result is achieved by recursively deep merging at
   *   each index. (not yet supported.)
   */
  ArrayStrategies: keyMirror({
    Clobber: true,
    IndexByIndex: true
  })

};

module.exports = mergeHelpers;

},{"./invariant":120,"./keyMirror":126}],132:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule mergeInto
 * @typechecks static-only
 */

"use strict";

var mergeHelpers = _dereq_("./mergeHelpers");

var checkMergeObjectArg = mergeHelpers.checkMergeObjectArg;
var checkMergeIntoObjectArg = mergeHelpers.checkMergeIntoObjectArg;

/**
 * Shallow merges two structures by mutating the first parameter.
 *
 * @param {object|function} one Object to be merged into.
 * @param {?object} two Optional object with properties to merge from.
 */
function mergeInto(one, two) {
  checkMergeIntoObjectArg(one);
  if (two != null) {
    checkMergeObjectArg(two);
    for (var key in two) {
      if (!two.hasOwnProperty(key)) {
        continue;
      }
      one[key] = two[key];
    }
  }
}

module.exports = mergeInto;

},{"./mergeHelpers":131}],133:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule mixInto
 */

"use strict";

/**
 * Simply copies properties to the prototype.
 */
var mixInto = function(constructor, methodBag) {
  var methodName;
  for (methodName in methodBag) {
    if (!methodBag.hasOwnProperty(methodName)) {
      continue;
    }
    constructor.prototype[methodName] = methodBag[methodName];
  }
};

module.exports = mixInto;

},{}],134:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule monitorCodeUse
 */

"use strict";

var invariant = _dereq_("./invariant");

/**
 * Provides open-source compatible instrumentation for monitoring certain API
 * uses before we're ready to issue a warning or refactor. It accepts an event
 * name which may only contain the characters [a-z0-9_] and an optional data
 * object with further information.
 */

function monitorCodeUse(eventName, data) {
  ("production" !== "development" ? invariant(
    eventName && !/[^a-z0-9_]/.test(eventName),
    'You must provide an eventName using only the characters [a-z0-9_]'
  ) : invariant(eventName && !/[^a-z0-9_]/.test(eventName)));
}

module.exports = monitorCodeUse;

},{"./invariant":120}],135:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule onlyChild
 */
"use strict";

var ReactDescriptor = _dereq_("./ReactDescriptor");

var invariant = _dereq_("./invariant");

/**
 * Returns the first child in a collection of children and verifies that there
 * is only one child in the collection. The current implementation of this
 * function assumes that a single child gets passed without a wrapper, but the
 * purpose of this helper function is to abstract away the particular structure
 * of children.
 *
 * @param {?object} children Child collection structure.
 * @return {ReactComponent} The first and only `ReactComponent` contained in the
 * structure.
 */
function onlyChild(children) {
  ("production" !== "development" ? invariant(
    ReactDescriptor.isValidDescriptor(children),
    'onlyChild must be passed a children with exactly one child.'
  ) : invariant(ReactDescriptor.isValidDescriptor(children)));
  return children;
}

module.exports = onlyChild;

},{"./ReactDescriptor":51,"./invariant":120}],136:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule performance
 * @typechecks
 */

"use strict";

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

var performance;

if (ExecutionEnvironment.canUseDOM) {
  performance =
    window.performance ||
    window.msPerformance ||
    window.webkitPerformance;
}

module.exports = performance || {};

},{"./ExecutionEnvironment":21}],137:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule performanceNow
 * @typechecks
 */

var performance = _dereq_("./performance");

/**
 * Detect if we can use `window.performance.now()` and gracefully fallback to
 * `Date.now()` if it doesn't exist. We need to support Firefox < 15 for now
 * because of Facebook's testing infrastructure.
 */
if (!performance || !performance.now) {
  performance = Date;
}

var performanceNow = performance.now.bind(performance);

module.exports = performanceNow;

},{"./performance":136}],138:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule setInnerHTML
 */

"use strict";

var ExecutionEnvironment = _dereq_("./ExecutionEnvironment");

/**
 * Set the innerHTML property of a node, ensuring that whitespace is preserved
 * even in IE8.
 *
 * @param {DOMElement} node
 * @param {string} html
 * @internal
 */
var setInnerHTML = function(node, html) {
  node.innerHTML = html;
};

if (ExecutionEnvironment.canUseDOM) {
  // IE8: When updating a just created node with innerHTML only leading
  // whitespace is removed. When updating an existing node with innerHTML
  // whitespace in root TextNodes is also collapsed.
  // @see quirksmode.org/bugreports/archives/2004/11/innerhtml_and_t.html

  // Feature detection; only IE8 is known to behave improperly like this.
  var testElement = document.createElement('div');
  testElement.innerHTML = ' ';
  if (testElement.innerHTML === '') {
    setInnerHTML = function(node, html) {
      // Magic theory: IE8 supposedly differentiates between added and updated
      // nodes when processing innerHTML, innerHTML on updated nodes suffers
      // from worse whitespace behavior. Re-adding a node like this triggers
      // the initial and more favorable whitespace behavior.
      // TODO: What to do on a detached node?
      if (node.parentNode) {
        node.parentNode.replaceChild(node, node);
      }

      // We also implement a workaround for non-visible tags disappearing into
      // thin air on IE8, this only happens if there is no visible text
      // in-front of the non-visible tags. Piggyback on the whitespace fix
      // and simply check if any non-visible tags appear in the source.
      if (html.match(/^[ \r\n\t\f]/) ||
          html[0] === '<' && (
            html.indexOf('<noscript') !== -1 ||
            html.indexOf('<script') !== -1 ||
            html.indexOf('<style') !== -1 ||
            html.indexOf('<meta') !== -1 ||
            html.indexOf('<link') !== -1)) {
        // Recover leading whitespace by temporarily prepending any character.
        // \uFEFF has the potential advantage of being zero-width/invisible.
        node.innerHTML = '\uFEFF' + html;

        // deleteData leaves an empty `TextNode` which offsets the index of all
        // children. Definitely want to avoid this.
        var textNode = node.firstChild;
        if (textNode.data.length === 1) {
          node.removeChild(textNode);
        } else {
          textNode.deleteData(0, 1);
        }
      } else {
        node.innerHTML = html;
      }
    };
  }
}

module.exports = setInnerHTML;

},{"./ExecutionEnvironment":21}],139:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule shallowEqual
 */

"use strict";

/**
 * Performs equality by iterating through keys on an object and returning
 * false when any key has values which are not strictly equal between
 * objA and objB. Returns true when the values of all keys are strictly equal.
 *
 * @return {boolean}
 */
function shallowEqual(objA, objB) {
  if (objA === objB) {
    return true;
  }
  var key;
  // Test for A's keys different from B.
  for (key in objA) {
    if (objA.hasOwnProperty(key) &&
        (!objB.hasOwnProperty(key) || objA[key] !== objB[key])) {
      return false;
    }
  }
  // Test for B'a keys missing from A.
  for (key in objB) {
    if (objB.hasOwnProperty(key) && !objA.hasOwnProperty(key)) {
      return false;
    }
  }
  return true;
}

module.exports = shallowEqual;

},{}],140:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule shouldUpdateReactComponent
 * @typechecks static-only
 */

"use strict";

/**
 * Given a `prevDescriptor` and `nextDescriptor`, determines if the existing
 * instance should be updated as opposed to being destroyed or replaced by a new
 * instance. Both arguments are descriptors. This ensures that this logic can
 * operate on stateless trees without any backing instance.
 *
 * @param {?object} prevDescriptor
 * @param {?object} nextDescriptor
 * @return {boolean} True if the existing instance should be updated.
 * @protected
 */
function shouldUpdateReactComponent(prevDescriptor, nextDescriptor) {
  if (prevDescriptor && nextDescriptor &&
      prevDescriptor.type === nextDescriptor.type && (
        (prevDescriptor.props && prevDescriptor.props.key) ===
        (nextDescriptor.props && nextDescriptor.props.key)
      ) && prevDescriptor._owner === nextDescriptor._owner) {
    return true;
  }
  return false;
}

module.exports = shouldUpdateReactComponent;

},{}],141:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule toArray
 * @typechecks
 */

var invariant = _dereq_("./invariant");

/**
 * Convert array-like objects to arrays.
 *
 * This API assumes the caller knows the contents of the data type. For less
 * well defined inputs use createArrayFrom.
 *
 * @param {object|function|filelist} obj
 * @return {array}
 */
function toArray(obj) {
  var length = obj.length;

  // Some browse builtin objects can report typeof 'function' (e.g. NodeList in
  // old versions of Safari).
  ("production" !== "development" ? invariant(
    !Array.isArray(obj) &&
    (typeof obj === 'object' || typeof obj === 'function'),
    'toArray: Array-like object expected'
  ) : invariant(!Array.isArray(obj) &&
  (typeof obj === 'object' || typeof obj === 'function')));

  ("production" !== "development" ? invariant(
    typeof length === 'number',
    'toArray: Object needs a length property'
  ) : invariant(typeof length === 'number'));

  ("production" !== "development" ? invariant(
    length === 0 ||
    (length - 1) in obj,
    'toArray: Object should have keys for indices'
  ) : invariant(length === 0 ||
  (length - 1) in obj));

  // Old IE doesn't give collections access to hasOwnProperty. Assume inputs
  // without method will throw during the slice call and skip straight to the
  // fallback.
  if (obj.hasOwnProperty) {
    try {
      return Array.prototype.slice.call(obj);
    } catch (e) {
      // IE < 9 does not support Array#slice on collections objects
    }
  }

  // Fall back to copying key by key. This assumes all keys have a value,
  // so will not preserve sparsely populated inputs.
  var ret = Array(length);
  for (var ii = 0; ii < length; ii++) {
    ret[ii] = obj[ii];
  }
  return ret;
}

module.exports = toArray;

},{"./invariant":120}],142:[function(_dereq_,module,exports){
/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule traverseAllChildren
 */

"use strict";

var ReactInstanceHandles = _dereq_("./ReactInstanceHandles");
var ReactTextComponent = _dereq_("./ReactTextComponent");

var invariant = _dereq_("./invariant");

var SEPARATOR = ReactInstanceHandles.SEPARATOR;
var SUBSEPARATOR = ':';

/**
 * TODO: Test that:
 * 1. `mapChildren` transforms strings and numbers into `ReactTextComponent`.
 * 2. it('should fail when supplied duplicate key', function() {
 * 3. That a single child and an array with one item have the same key pattern.
 * });
 */

var userProvidedKeyEscaperLookup = {
  '=': '=0',
  '.': '=1',
  ':': '=2'
};

var userProvidedKeyEscapeRegex = /[=.:]/g;

function userProvidedKeyEscaper(match) {
  return userProvidedKeyEscaperLookup[match];
}

/**
 * Generate a key string that identifies a component within a set.
 *
 * @param {*} component A component that could contain a manual key.
 * @param {number} index Index that is used if a manual key is not provided.
 * @return {string}
 */
function getComponentKey(component, index) {
  if (component && component.props && component.props.key != null) {
    // Explicit key
    return wrapUserProvidedKey(component.props.key);
  }
  // Implicit key determined by the index in the set
  return index.toString(36);
}

/**
 * Escape a component key so that it is safe to use in a reactid.
 *
 * @param {*} key Component key to be escaped.
 * @return {string} An escaped string.
 */
function escapeUserProvidedKey(text) {
  return ('' + text).replace(
    userProvidedKeyEscapeRegex,
    userProvidedKeyEscaper
  );
}

/**
 * Wrap a `key` value explicitly provided by the user to distinguish it from
 * implicitly-generated keys generated by a component's index in its parent.
 *
 * @param {string} key Value of a user-provided `key` attribute
 * @return {string}
 */
function wrapUserProvidedKey(key) {
  return '$' + escapeUserProvidedKey(key);
}

/**
 * @param {?*} children Children tree container.
 * @param {!string} nameSoFar Name of the key path so far.
 * @param {!number} indexSoFar Number of children encountered until this point.
 * @param {!function} callback Callback to invoke with each child found.
 * @param {?*} traverseContext Used to pass information throughout the traversal
 * process.
 * @return {!number} The number of children in this subtree.
 */
var traverseAllChildrenImpl =
  function(children, nameSoFar, indexSoFar, callback, traverseContext) {
    var subtreeCount = 0;  // Count of children found in the current subtree.
    if (Array.isArray(children)) {
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var nextName = (
          nameSoFar +
          (nameSoFar ? SUBSEPARATOR : SEPARATOR) +
          getComponentKey(child, i)
        );
        var nextIndex = indexSoFar + subtreeCount;
        subtreeCount += traverseAllChildrenImpl(
          child,
          nextName,
          nextIndex,
          callback,
          traverseContext
        );
      }
    } else {
      var type = typeof children;
      var isOnlyChild = nameSoFar === '';
      // If it's the only child, treat the name as if it was wrapped in an array
      // so that it's consistent if the number of children grows
      var storageName =
        isOnlyChild ? SEPARATOR + getComponentKey(children, 0) : nameSoFar;
      if (children == null || type === 'boolean') {
        // All of the above are perceived as null.
        callback(traverseContext, null, storageName, indexSoFar);
        subtreeCount = 1;
      } else if (children.type && children.type.prototype &&
                 children.type.prototype.mountComponentIntoNode) {
        callback(traverseContext, children, storageName, indexSoFar);
        subtreeCount = 1;
      } else {
        if (type === 'object') {
          ("production" !== "development" ? invariant(
            !children || children.nodeType !== 1,
            'traverseAllChildren(...): Encountered an invalid child; DOM ' +
            'elements are not valid children of React components.'
          ) : invariant(!children || children.nodeType !== 1));
          for (var key in children) {
            if (children.hasOwnProperty(key)) {
              subtreeCount += traverseAllChildrenImpl(
                children[key],
                (
                  nameSoFar + (nameSoFar ? SUBSEPARATOR : SEPARATOR) +
                  wrapUserProvidedKey(key) + SUBSEPARATOR +
                  getComponentKey(children[key], 0)
                ),
                indexSoFar + subtreeCount,
                callback,
                traverseContext
              );
            }
          }
        } else if (type === 'string') {
          var normalizedText = ReactTextComponent(children);
          callback(traverseContext, normalizedText, storageName, indexSoFar);
          subtreeCount += 1;
        } else if (type === 'number') {
          var normalizedNumber = ReactTextComponent('' + children);
          callback(traverseContext, normalizedNumber, storageName, indexSoFar);
          subtreeCount += 1;
        }
      }
    }
    return subtreeCount;
  };

/**
 * Traverses children that are typically specified as `props.children`, but
 * might also be specified through attributes:
 *
 * - `traverseAllChildren(this.props.children, ...)`
 * - `traverseAllChildren(this.props.leftPanelChildren, ...)`
 *
 * The `traverseContext` is an optional argument that is passed through the
 * entire traversal. It can be used to store accumulations or anything else that
 * the callback might find relevant.
 *
 * @param {?*} children Children tree object.
 * @param {!function} callback To invoke upon traversing each child.
 * @param {?*} traverseContext Context for traversal.
 * @return {!number} The number of children in this subtree.
 */
function traverseAllChildren(children, callback, traverseContext) {
  if (children == null) {
    return 0;
  }

  return traverseAllChildrenImpl(children, '', 0, callback, traverseContext);
}

module.exports = traverseAllChildren;

},{"./ReactInstanceHandles":59,"./ReactTextComponent":75,"./invariant":120}],143:[function(_dereq_,module,exports){
/**
 * Copyright 2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule warning
 */

"use strict";

var emptyFunction = _dereq_("./emptyFunction");

/**
 * Similar to invariant but only logs a warning if the condition is not met.
 * This can be used to log issues in development environments in critical
 * paths. Removing the logging code for production environments will keep the
 * same logic and follow the same code paths.
 */

var warning = emptyFunction;

if ("production" !== "development") {
  warning = function(condition, format ) {var args=Array.prototype.slice.call(arguments,2);
    if (format === undefined) {
      throw new Error(
        '`warning(condition, format, ...args)` requires a warning ' +
        'message argument'
      );
    }

    if (!condition) {
      var argIndex = 0;
      console.warn('Warning: ' + format.replace(/%s/g, function()  {return args[argIndex++];}));
    }
  };
}

module.exports = warning;

},{"./emptyFunction":102}]},{},[27])
(27)
});if(typeof Math.imul == "undefined" || (Math.imul(0xffffffff,5) == 0)) {
    Math.imul = function (a, b) {
        var ah  = (a >>> 16) & 0xffff;
        var al = a & 0xffff;
        var bh  = (b >>> 16) & 0xffff;
        var bl = b & 0xffff;
        // the shift by 0 fixes the sign on the high part
        // the final |0 converts the unsigned value into a signed value
        return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)|0);
    }
}

;(function(){
var g, aa = aa || {}, ba = this;
function ca(a, b) {
  var c = a.split("."), d = ba;
  c[0] in d || !d.execScript || d.execScript("var " + c[0]);
  for (var e;c.length && (e = c.shift());) {
    c.length || void 0 === b ? d = d[e] ? d[e] : d[e] = {} : d[e] = b;
  }
}
function da(a) {
  a = a.split(".");
  for (var b = ba, c;c = a.shift();) {
    if (null != b[c]) {
      b = b[c];
    } else {
      return null;
    }
  }
  return b;
}
function ea() {
}
function q(a) {
  var b = typeof a;
  if ("object" == b) {
    if (a) {
      if (a instanceof Array) {
        return "array";
      }
      if (a instanceof Object) {
        return b;
      }
      var c = Object.prototype.toString.call(a);
      if ("[object Window]" == c) {
        return "object";
      }
      if ("[object Array]" == c || "number" == typeof a.length && "undefined" != typeof a.splice && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("splice")) {
        return "array";
      }
      if ("[object Function]" == c || "undefined" != typeof a.call && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("call")) {
        return "function";
      }
    } else {
      return "null";
    }
  } else {
    if ("function" == b && "undefined" == typeof a.call) {
      return "object";
    }
  }
  return b;
}
function fa(a) {
  var b = q(a);
  return "array" == b || "object" == b && "number" == typeof a.length;
}
function ga(a) {
  return "string" == typeof a;
}
function ha(a) {
  return "function" == q(a);
}
function ja(a) {
  return a[ka] || (a[ka] = ++la);
}
var ka = "closure_uid_" + (1E9 * Math.random() >>> 0), la = 0;
function ma(a, b, c) {
  return a.call.apply(a.bind, arguments);
}
function na(a, b, c) {
  if (!a) {
    throw Error();
  }
  if (2 < arguments.length) {
    var d = Array.prototype.slice.call(arguments, 2);
    return function() {
      var c = Array.prototype.slice.call(arguments);
      Array.prototype.unshift.apply(c, d);
      return a.apply(b, c);
    };
  }
  return function() {
    return a.apply(b, arguments);
  };
}
function oa(a, b, c) {
  oa = Function.prototype.bind && -1 != Function.prototype.bind.toString().indexOf("native code") ? ma : na;
  return oa.apply(null, arguments);
}
var pa = Date.now || function() {
  return+new Date;
};
function qa(a, b) {
  function c() {
  }
  c.prototype = b.prototype;
  a.Fe = b.prototype;
  a.prototype = new c;
  a.prototype.constructor = a;
  a.Ac = function(a, c, f) {
    return b.prototype[c].apply(a, Array.prototype.slice.call(arguments, 2));
  };
}
;function ra(a, b) {
  for (var c = a.split("%s"), d = "", e = Array.prototype.slice.call(arguments, 1);e.length && 1 < c.length;) {
    d += c.shift() + e.shift();
  }
  return d + c.join("%s");
}
function sa(a) {
  if (!ta.test(a)) {
    return a;
  }
  -1 != a.indexOf("\x26") && (a = a.replace(ua, "\x26amp;"));
  -1 != a.indexOf("\x3c") && (a = a.replace(va, "\x26lt;"));
  -1 != a.indexOf("\x3e") && (a = a.replace(xa, "\x26gt;"));
  -1 != a.indexOf('"') && (a = a.replace(ya, "\x26quot;"));
  -1 != a.indexOf("'") && (a = a.replace(za, "\x26#39;"));
  -1 != a.indexOf("\x00") && (a = a.replace(Ba, "\x26#0;"));
  return a;
}
var ua = /&/g, va = /</g, xa = />/g, ya = /"/g, za = /'/g, Ba = /\x00/g, ta = /[\x00&<>"']/;
function Ca(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
;function Da(a, b) {
  for (var c in a) {
    b.call(void 0, a[c], c, a);
  }
}
function Ea(a) {
  var b = [], c = 0, d;
  for (d in a) {
    b[c++] = a[d];
  }
  return b;
}
function Fa(a) {
  var b = [], c = 0, d;
  for (d in a) {
    b[c++] = d;
  }
  return b;
}
var Ga = "constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");
function Ka(a, b) {
  for (var c, d, e = 1;e < arguments.length;e++) {
    d = arguments[e];
    for (c in d) {
      a[c] = d[c];
    }
    for (var f = 0;f < Ga.length;f++) {
      c = Ga[f], Object.prototype.hasOwnProperty.call(d, c) && (a[c] = d[c]);
    }
  }
}
;function La(a, b) {
  null != a && this.append.apply(this, arguments);
}
g = La.prototype;
g.rb = "";
g.set = function(a) {
  this.rb = "" + a;
};
g.append = function(a, b, c) {
  this.rb += a;
  if (null != b) {
    for (var d = 1;d < arguments.length;d++) {
      this.rb += arguments[d];
    }
  }
  return this;
};
g.clear = function() {
  this.rb = "";
};
g.toString = function() {
  return this.rb;
};
function Ma(a) {
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, Ma);
  } else {
    var b = Error().stack;
    b && (this.stack = b);
  }
  a && (this.message = String(a));
}
qa(Ma, Error);
Ma.prototype.name = "CustomError";
function Oa(a, b) {
  b.unshift(a);
  Ma.call(this, ra.apply(null, b));
  b.shift();
}
qa(Oa, Ma);
Oa.prototype.name = "AssertionError";
function Pa(a, b) {
  throw new Oa("Failure" + (a ? ": " + a : ""), Array.prototype.slice.call(arguments, 1));
}
;var Qa = Array.prototype, Ra = Qa.indexOf ? function(a, b, c) {
  return Qa.indexOf.call(a, b, c);
} : function(a, b, c) {
  c = null == c ? 0 : 0 > c ? Math.max(0, a.length + c) : c;
  if (ga(a)) {
    return ga(b) && 1 == b.length ? a.indexOf(b, c) : -1;
  }
  for (;c < a.length;c++) {
    if (c in a && a[c] === b) {
      return c;
    }
  }
  return-1;
}, Sa = Qa.forEach ? function(a, b, c) {
  Qa.forEach.call(a, b, c);
} : function(a, b, c) {
  for (var d = a.length, e = ga(a) ? a.split("") : a, f = 0;f < d;f++) {
    f in e && b.call(c, e[f], f, a);
  }
};
function Ua(a) {
  var b;
  a: {
    b = Va;
    for (var c = a.length, d = ga(a) ? a.split("") : a, e = 0;e < c;e++) {
      if (e in d && b.call(void 0, d[e], e, a)) {
        b = e;
        break a;
      }
    }
    b = -1;
  }
  return 0 > b ? null : ga(a) ? a.charAt(b) : a[b];
}
function Wa(a) {
  return Qa.concat.apply(Qa, arguments);
}
function Xa(a) {
  var b = a.length;
  if (0 < b) {
    for (var c = Array(b), d = 0;d < b;d++) {
      c[d] = a[d];
    }
    return c;
  }
  return[];
}
;var Za = null;
function $a() {
  return new s(null, 5, [ab, !0, bb, !0, eb, !1, fb, !1, gb, null], null);
}
function t(a) {
  return null != a && !1 !== a;
}
function hb(a) {
  return t(a) ? !1 : !0;
}
function u(a, b) {
  return a[q(null == b ? null : b)] ? !0 : a._ ? !0 : !1;
}
function ib(a) {
  return null == a ? null : a.constructor;
}
function w(a, b) {
  var c = ib(b), c = t(t(c) ? c.we : c) ? c.ve : q(b);
  return Error(["No protocol method ", a, " defined for type ", c, ": ", b].join(""));
}
function kb(a) {
  var b = a.ve;
  return t(b) ? b : "" + x.e(a);
}
function lb(a) {
  for (var b = a.length, c = Array(b), d = 0;;) {
    if (d < b) {
      c[d] = a[d], d += 1;
    } else {
      break;
    }
  }
  return c;
}
function mb(a) {
  return Array.prototype.slice.call(arguments);
}
var ob = function() {
  function a(a, b) {
    function c(a, b) {
      a.push(b);
      return a;
    }
    var h = [];
    return nb.g ? nb.g(c, h, b) : nb.call(null, c, h, b);
  }
  function b(a) {
    return c.a(null, a);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, 0, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), pb = {}, rb = {};
function sb(a) {
  if (a ? a.wa : a) {
    return a.wa(a);
  }
  var b;
  b = sb[q(null == a ? null : a)];
  if (!b && (b = sb._, !b)) {
    throw w("ICloneable.-clone", a);
  }
  return b.call(null, a);
}
var tb = {};
function ub(a) {
  if (a ? a.ca : a) {
    return a.ca(a);
  }
  var b;
  b = ub[q(null == a ? null : a)];
  if (!b && (b = ub._, !b)) {
    throw w("ICounted.-count", a);
  }
  return b.call(null, a);
}
function vb(a) {
  if (a ? a.aa : a) {
    return a.aa(a);
  }
  var b;
  b = vb[q(null == a ? null : a)];
  if (!b && (b = vb._, !b)) {
    throw w("IEmptyableCollection.-empty", a);
  }
  return b.call(null, a);
}
var wb = {};
function xb(a, b) {
  if (a ? a.V : a) {
    return a.V(a, b);
  }
  var c;
  c = xb[q(null == a ? null : a)];
  if (!c && (c = xb._, !c)) {
    throw w("ICollection.-conj", a);
  }
  return c.call(null, a, b);
}
var yb = {}, z = function() {
  function a(a, b, c) {
    if (a ? a.va : a) {
      return a.va(a, b, c);
    }
    var h;
    h = z[q(null == a ? null : a)];
    if (!h && (h = z._, !h)) {
      throw w("IIndexed.-nth", a);
    }
    return h.call(null, a, b, c);
  }
  function b(a, b) {
    if (a ? a.K : a) {
      return a.K(a, b);
    }
    var c;
    c = z[q(null == a ? null : a)];
    if (!c && (c = z._, !c)) {
      throw w("IIndexed.-nth", a);
    }
    return c.call(null, a, b);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}(), zb = {};
function Ab(a) {
  if (a ? a.ga : a) {
    return a.ga(a);
  }
  var b;
  b = Ab[q(null == a ? null : a)];
  if (!b && (b = Ab._, !b)) {
    throw w("ISeq.-first", a);
  }
  return b.call(null, a);
}
function Bb(a) {
  if (a ? a.ma : a) {
    return a.ma(a);
  }
  var b;
  b = Bb[q(null == a ? null : a)];
  if (!b && (b = Bb._, !b)) {
    throw w("ISeq.-rest", a);
  }
  return b.call(null, a);
}
var Cb = {}, Db = {}, Eb = function() {
  function a(a, b, c) {
    if (a ? a.H : a) {
      return a.H(a, b, c);
    }
    var h;
    h = Eb[q(null == a ? null : a)];
    if (!h && (h = Eb._, !h)) {
      throw w("ILookup.-lookup", a);
    }
    return h.call(null, a, b, c);
  }
  function b(a, b) {
    if (a ? a.G : a) {
      return a.G(a, b);
    }
    var c;
    c = Eb[q(null == a ? null : a)];
    if (!c && (c = Eb._, !c)) {
      throw w("ILookup.-lookup", a);
    }
    return c.call(null, a, b);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}();
function Fb(a, b) {
  if (a ? a.Dc : a) {
    return a.Dc(a, b);
  }
  var c;
  c = Fb[q(null == a ? null : a)];
  if (!c && (c = Fb._, !c)) {
    throw w("IAssociative.-contains-key?", a);
  }
  return c.call(null, a, b);
}
function Hb(a, b, c) {
  if (a ? a.sb : a) {
    return a.sb(a, b, c);
  }
  var d;
  d = Hb[q(null == a ? null : a)];
  if (!d && (d = Hb._, !d)) {
    throw w("IAssociative.-assoc", a);
  }
  return d.call(null, a, b, c);
}
var Ib = {};
function Jb(a, b) {
  if (a ? a.Hc : a) {
    return a.Hc(a, b);
  }
  var c;
  c = Jb[q(null == a ? null : a)];
  if (!c && (c = Jb._, !c)) {
    throw w("IMap.-dissoc", a);
  }
  return c.call(null, a, b);
}
var Kb = {};
function Lb(a) {
  if (a ? a.kc : a) {
    return a.kc(a);
  }
  var b;
  b = Lb[q(null == a ? null : a)];
  if (!b && (b = Lb._, !b)) {
    throw w("IMapEntry.-key", a);
  }
  return b.call(null, a);
}
function Mb(a) {
  if (a ? a.lc : a) {
    return a.lc(a);
  }
  var b;
  b = Mb[q(null == a ? null : a)];
  if (!b && (b = Mb._, !b)) {
    throw w("IMapEntry.-val", a);
  }
  return b.call(null, a);
}
var Nb = {};
function Ob(a) {
  if (a ? a.tb : a) {
    return a.tb(a);
  }
  var b;
  b = Ob[q(null == a ? null : a)];
  if (!b && (b = Ob._, !b)) {
    throw w("IStack.-peek", a);
  }
  return b.call(null, a);
}
function Qb(a) {
  if (a ? a.ub : a) {
    return a.ub(a);
  }
  var b;
  b = Qb[q(null == a ? null : a)];
  if (!b && (b = Qb._, !b)) {
    throw w("IStack.-pop", a);
  }
  return b.call(null, a);
}
var Rb = {};
function Sb(a, b, c) {
  if (a ? a.Cb : a) {
    return a.Cb(a, b, c);
  }
  var d;
  d = Sb[q(null == a ? null : a)];
  if (!d && (d = Sb._, !d)) {
    throw w("IVector.-assoc-n", a);
  }
  return d.call(null, a, b, c);
}
function Tb(a) {
  if (a ? a.hc : a) {
    return a.hc(a);
  }
  var b;
  b = Tb[q(null == a ? null : a)];
  if (!b && (b = Tb._, !b)) {
    throw w("IDeref.-deref", a);
  }
  return b.call(null, a);
}
var Ub = {};
function Vb(a) {
  if (a ? a.R : a) {
    return a.R(a);
  }
  var b;
  b = Vb[q(null == a ? null : a)];
  if (!b && (b = Vb._, !b)) {
    throw w("IMeta.-meta", a);
  }
  return b.call(null, a);
}
var Wb = {};
function Xb(a, b) {
  if (a ? a.Y : a) {
    return a.Y(a, b);
  }
  var c;
  c = Xb[q(null == a ? null : a)];
  if (!c && (c = Xb._, !c)) {
    throw w("IWithMeta.-with-meta", a);
  }
  return c.call(null, a, b);
}
var Yb = {}, Zb = function() {
  function a(a, b, c) {
    if (a ? a.ia : a) {
      return a.ia(a, b, c);
    }
    var h;
    h = Zb[q(null == a ? null : a)];
    if (!h && (h = Zb._, !h)) {
      throw w("IReduce.-reduce", a);
    }
    return h.call(null, a, b, c);
  }
  function b(a, b) {
    if (a ? a.ha : a) {
      return a.ha(a, b);
    }
    var c;
    c = Zb[q(null == a ? null : a)];
    if (!c && (c = Zb._, !c)) {
      throw w("IReduce.-reduce", a);
    }
    return c.call(null, a, b);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}();
function $b(a, b, c) {
  if (a ? a.jc : a) {
    return a.jc(a, b, c);
  }
  var d;
  d = $b[q(null == a ? null : a)];
  if (!d && (d = $b._, !d)) {
    throw w("IKVReduce.-kv-reduce", a);
  }
  return d.call(null, a, b, c);
}
function ac(a, b) {
  if (a ? a.B : a) {
    return a.B(a, b);
  }
  var c;
  c = ac[q(null == a ? null : a)];
  if (!c && (c = ac._, !c)) {
    throw w("IEquiv.-equiv", a);
  }
  return c.call(null, a, b);
}
function bc(a) {
  if (a ? a.J : a) {
    return a.J(a);
  }
  var b;
  b = bc[q(null == a ? null : a)];
  if (!b && (b = bc._, !b)) {
    throw w("IHash.-hash", a);
  }
  return b.call(null, a);
}
var dc = {};
function ec(a) {
  if (a ? a.X : a) {
    return a.X(a);
  }
  var b;
  b = ec[q(null == a ? null : a)];
  if (!b && (b = ec._, !b)) {
    throw w("ISeqable.-seq", a);
  }
  return b.call(null, a);
}
var fc = {};
function A(a, b) {
  if (a ? a.Jd : a) {
    return a.Jd(0, b);
  }
  var c;
  c = A[q(null == a ? null : a)];
  if (!c && (c = A._, !c)) {
    throw w("IWriter.-write", a);
  }
  return c.call(null, a, b);
}
var gc = {};
function hc(a, b, c) {
  if (a ? a.L : a) {
    return a.L(a, b, c);
  }
  var d;
  d = hc[q(null == a ? null : a)];
  if (!d && (d = hc._, !d)) {
    throw w("IPrintWithWriter.-pr-writer", a);
  }
  return d.call(null, a, b, c);
}
function ic(a, b, c) {
  if (a ? a.Kc : a) {
    return a.Kc(a, b, c);
  }
  var d;
  d = ic[q(null == a ? null : a)];
  if (!d && (d = ic._, !d)) {
    throw w("IWatchable.-notify-watches", a);
  }
  return d.call(null, a, b, c);
}
function jc(a, b, c) {
  if (a ? a.Jc : a) {
    return a.Jc(a, b, c);
  }
  var d;
  d = jc[q(null == a ? null : a)];
  if (!d && (d = jc._, !d)) {
    throw w("IWatchable.-add-watch", a);
  }
  return d.call(null, a, b, c);
}
function kc(a, b) {
  if (a ? a.Lc : a) {
    return a.Lc(a, b);
  }
  var c;
  c = kc[q(null == a ? null : a)];
  if (!c && (c = kc._, !c)) {
    throw w("IWatchable.-remove-watch", a);
  }
  return c.call(null, a, b);
}
function lc(a) {
  if (a ? a.Pb : a) {
    return a.Pb(a);
  }
  var b;
  b = lc[q(null == a ? null : a)];
  if (!b && (b = lc._, !b)) {
    throw w("IEditableCollection.-as-transient", a);
  }
  return b.call(null, a);
}
function mc(a, b) {
  if (a ? a.Ab : a) {
    return a.Ab(a, b);
  }
  var c;
  c = mc[q(null == a ? null : a)];
  if (!c && (c = mc._, !c)) {
    throw w("ITransientCollection.-conj!", a);
  }
  return c.call(null, a, b);
}
function nc(a) {
  if (a ? a.Bb : a) {
    return a.Bb(a);
  }
  var b;
  b = nc[q(null == a ? null : a)];
  if (!b && (b = nc._, !b)) {
    throw w("ITransientCollection.-persistent!", a);
  }
  return b.call(null, a);
}
function oc(a, b, c) {
  if (a ? a.nc : a) {
    return a.nc(a, b, c);
  }
  var d;
  d = oc[q(null == a ? null : a)];
  if (!d && (d = oc._, !d)) {
    throw w("ITransientAssociative.-assoc!", a);
  }
  return d.call(null, a, b, c);
}
function pc(a, b, c) {
  if (a ? a.Id : a) {
    return a.Id(0, b, c);
  }
  var d;
  d = pc[q(null == a ? null : a)];
  if (!d && (d = pc._, !d)) {
    throw w("ITransientVector.-assoc-n!", a);
  }
  return d.call(null, a, b, c);
}
function qc(a) {
  if (a ? a.Gd : a) {
    return a.Gd();
  }
  var b;
  b = qc[q(null == a ? null : a)];
  if (!b && (b = qc._, !b)) {
    throw w("IChunk.-drop-first", a);
  }
  return b.call(null, a);
}
function rc(a) {
  if (a ? a.hd : a) {
    return a.hd(a);
  }
  var b;
  b = rc[q(null == a ? null : a)];
  if (!b && (b = rc._, !b)) {
    throw w("IChunkedSeq.-chunked-first", a);
  }
  return b.call(null, a);
}
function sc(a) {
  if (a ? a.jd : a) {
    return a.jd(a);
  }
  var b;
  b = sc[q(null == a ? null : a)];
  if (!b && (b = sc._, !b)) {
    throw w("IChunkedSeq.-chunked-rest", a);
  }
  return b.call(null, a);
}
function tc(a) {
  if (a ? a.gd : a) {
    return a.gd(a);
  }
  var b;
  b = tc[q(null == a ? null : a)];
  if (!b && (b = tc._, !b)) {
    throw w("IChunkedNext.-chunked-next", a);
  }
  return b.call(null, a);
}
function uc(a, b) {
  if (a ? a.ld : a) {
    return a.ld(a, b);
  }
  var c;
  c = uc[q(null == a ? null : a)];
  if (!c && (c = uc._, !c)) {
    throw w("IReset.-reset!", a);
  }
  return c.call(null, a, b);
}
var vc = function() {
  function a(a, b, c, d, e) {
    if (a ? a.pd : a) {
      return a.pd(a, b, c, d, e);
    }
    var n;
    n = vc[q(null == a ? null : a)];
    if (!n && (n = vc._, !n)) {
      throw w("ISwap.-swap!", a);
    }
    return n.call(null, a, b, c, d, e);
  }
  function b(a, b, c, d) {
    if (a ? a.od : a) {
      return a.od(a, b, c, d);
    }
    var e;
    e = vc[q(null == a ? null : a)];
    if (!e && (e = vc._, !e)) {
      throw w("ISwap.-swap!", a);
    }
    return e.call(null, a, b, c, d);
  }
  function c(a, b, c) {
    if (a ? a.nd : a) {
      return a.nd(a, b, c);
    }
    var d;
    d = vc[q(null == a ? null : a)];
    if (!d && (d = vc._, !d)) {
      throw w("ISwap.-swap!", a);
    }
    return d.call(null, a, b, c);
  }
  function d(a, b) {
    if (a ? a.md : a) {
      return a.md(a, b);
    }
    var c;
    c = vc[q(null == a ? null : a)];
    if (!c && (c = vc._, !c)) {
      throw w("ISwap.-swap!", a);
    }
    return c.call(null, a, b);
  }
  var e = null, e = function(e, h, k, l, m) {
    switch(arguments.length) {
      case 2:
        return d.call(this, e, h);
      case 3:
        return c.call(this, e, h, k);
      case 4:
        return b.call(this, e, h, k, l);
      case 5:
        return a.call(this, e, h, k, l, m);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  e.a = d;
  e.g = c;
  e.v = b;
  e.Q = a;
  return e;
}();
function wc(a) {
  if (a ? a.ic : a) {
    return a.ic(a);
  }
  var b;
  b = wc[q(null == a ? null : a)];
  if (!b && (b = wc._, !b)) {
    throw w("IIterable.-iterator", a);
  }
  return b.call(null, a);
}
function xc(a) {
  this.Ee = a;
  this.F = 0;
  this.p = 1073741824;
}
xc.prototype.Jd = function(a, b) {
  return this.Ee.append(b);
};
function yc(a) {
  var b = new La;
  a.L(null, new xc(b), $a());
  return "" + x.e(b);
}
var Ac = "undefined" !== typeof Math.imul && 0 !== (Math.imul.a ? Math.imul.a(4294967295, 5) : Math.imul.call(null, 4294967295, 5)) ? function(a, b) {
  return Math.imul.a ? Math.imul.a(a, b) : Math.imul.call(null, a, b);
} : function(a, b) {
  var c = a & 65535, d = b & 65535;
  return c * d + ((a >>> 16 & 65535) * d + c * (b >>> 16 & 65535) << 16 >>> 0) | 0;
};
function Bc(a) {
  a = Ac(a, 3432918353);
  return Ac(a << 15 | a >>> -15, 461845907);
}
function Cc(a, b) {
  var c = a ^ b;
  return Ac(c << 13 | c >>> -13, 5) + 3864292196;
}
function Dc(a, b) {
  var c = a ^ b, c = Ac(c ^ c >>> 16, 2246822507), c = Ac(c ^ c >>> 13, 3266489909);
  return c ^ c >>> 16;
}
function Ec(a) {
  var b;
  a: {
    b = 1;
    for (var c = 0;;) {
      if (b < a.length) {
        var d = b + 2, c = Cc(c, Bc(a.charCodeAt(b - 1) | a.charCodeAt(b) << 16));
        b = d;
      } else {
        b = c;
        break a;
      }
    }
    b = void 0;
  }
  b = 1 === (a.length & 1) ? b ^ Bc(a.charCodeAt(a.length - 1)) : b;
  return Dc(b, Ac(2, a.length));
}
var Fc = {}, Gc = 0;
function Hc(a) {
  255 < Gc && (Fc = {}, Gc = 0);
  var b = Fc[a];
  if ("number" !== typeof b) {
    a: {
      if (null != a) {
        if (b = a.length, 0 < b) {
          for (var c = 0, d = 0;;) {
            if (c < b) {
              var e = c + 1, d = Ac(31, d) + a.charCodeAt(c), c = e
            } else {
              b = d;
              break a;
            }
          }
          b = void 0;
        } else {
          b = 0;
        }
      } else {
        b = 0;
      }
    }
    Fc[a] = b;
    Gc += 1;
  }
  return a = b;
}
function Ic(a) {
  a && (a.p & 4194304 || a.kd) ? a = a.J(null) : "number" === typeof a ? a = (Math.floor.e ? Math.floor.e(a) : Math.floor.call(null, a)) % 2147483647 : !0 === a ? a = 1 : !1 === a ? a = 0 : "string" === typeof a ? (a = Hc(a), 0 !== a && (a = Bc(a), a = Cc(0, a), a = Dc(a, 4))) : a = null == a ? 0 : bc(a);
  return a;
}
function Jc(a, b) {
  return a ^ b + 2654435769 + (a << 6) + (a >> 2);
}
function Kc(a, b) {
  if (t(C.a ? C.a(a, b) : C.call(null, a, b))) {
    return 0;
  }
  if (t(function() {
    var c = hb(a.Sa);
    return c ? b.Sa : c;
  }())) {
    return-1;
  }
  if (t(a.Sa)) {
    if (hb(b.Sa)) {
      return 1;
    }
    var c = function() {
      var c = a.Sa, d = b.Sa;
      return Lc.a ? Lc.a(c, d) : Lc.call(null, c, d);
    }();
    if (0 === c) {
      var c = a.name, d = b.name;
      return Lc.a ? Lc.a(c, d) : Lc.call(null, c, d);
    }
    return c;
  }
  c = a.name;
  d = b.name;
  return Lc.a ? Lc.a(c, d) : Lc.call(null, c, d);
}
function E(a, b, c, d, e) {
  this.Sa = a;
  this.name = b;
  this.Ba = c;
  this.Lb = d;
  this.ua = e;
  this.p = 2154168321;
  this.F = 4096;
}
g = E.prototype;
g.L = function(a, b) {
  return A(b, this.Ba);
};
g.J = function() {
  var a = this.Lb;
  return null != a ? a : this.Lb = a = Jc(Ec(this.name), Hc(this.Sa));
};
g.Y = function(a, b) {
  return new E(this.Sa, this.name, this.Ba, this.Lb, b);
};
g.R = function() {
  return this.ua;
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return Eb.g(c, this, null);
      case 3:
        return Eb.g(c, this, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return Eb.g(c, this, null);
  };
  a.g = function(a, c, d) {
    return Eb.g(c, this, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return Eb.g(a, this, null);
};
g.a = function(a, b) {
  return Eb.g(a, this, b);
};
g.B = function(a, b) {
  return b instanceof E ? this.Ba === b.Ba : !1;
};
g.toString = function() {
  return this.Ba;
};
g.equiv = function(a) {
  return this.B(null, a);
};
var Mc = function() {
  function a(a, b) {
    var c = null != a ? "" + x.e(a) + "/" + x.e(b) : b;
    return new E(a, b, c, null, null);
  }
  function b(a) {
    return a instanceof E ? a : c.a(null, a);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function F(a) {
  if (null == a) {
    return null;
  }
  if (a && (a.p & 8388608 || a.Oe)) {
    return a.X(null);
  }
  if (a instanceof Array || "string" === typeof a) {
    return 0 === a.length ? null : new Nc(a, 0);
  }
  if (u(dc, a)) {
    return ec(a);
  }
  throw Error("" + x.e(a) + " is not ISeqable");
}
function G(a) {
  if (null == a) {
    return null;
  }
  if (a && (a.p & 64 || a.mc)) {
    return a.ga(null);
  }
  a = F(a);
  return null == a ? null : Ab(a);
}
function I(a) {
  return null != a ? a && (a.p & 64 || a.mc) ? a.ma(null) : (a = F(a)) ? Bb(a) : J : J;
}
function K(a) {
  return null == a ? null : a && (a.p & 128 || a.Ic) ? a.pa(null) : F(I(a));
}
var C = function() {
  function a(a, b) {
    return null == a ? null == b : a === b || ac(a, b);
  }
  var b = null, c = function() {
    function a(b, d, k) {
      var l = null;
      2 < arguments.length && (l = L(Array.prototype.slice.call(arguments, 2), 0));
      return c.call(this, b, d, l);
    }
    function c(a, d, e) {
      for (;;) {
        if (b.a(a, d)) {
          if (K(e)) {
            a = d, d = G(e), e = K(e);
          } else {
            return b.a(d, G(e));
          }
        } else {
          return!1;
        }
      }
    }
    a.D = 2;
    a.s = function(a) {
      var b = G(a);
      a = K(a);
      var d = G(a);
      a = I(a);
      return c(b, d, a);
    };
    a.j = c;
    return a;
  }(), b = function(b, e, f) {
    switch(arguments.length) {
      case 1:
        return!0;
      case 2:
        return a.call(this, b, e);
      default:
        return c.j(b, e, L(arguments, 2));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 2;
  b.s = c.s;
  b.e = function() {
    return!0;
  };
  b.a = a;
  b.j = c.j;
  return b;
}();
function Oc(a, b) {
  var c = Bc(a), c = Cc(0, c);
  return Dc(c, b);
}
function Pc(a) {
  var b = 0, c = 1;
  for (a = F(a);;) {
    if (null != a) {
      b += 1, c = Ac(31, c) + Ic(G(a)) | 0, a = K(a);
    } else {
      return Oc(c, b);
    }
  }
}
function Qc(a) {
  var b = 0, c = 0;
  for (a = F(a);;) {
    if (null != a) {
      b += 1, c = c + Ic(G(a)) | 0, a = K(a);
    } else {
      return Oc(c, b);
    }
  }
}
tb["null"] = !0;
ub["null"] = function() {
  return 0;
};
Date.prototype.B = function(a, b) {
  return b instanceof Date && this.toString() === b.toString();
};
ac.number = function(a, b) {
  return a === b;
};
Ub["function"] = !0;
Vb["function"] = function() {
  return null;
};
pb["function"] = !0;
bc._ = function(a) {
  return ja(a);
};
function Rc(a) {
  return a + 1;
}
function Tc(a) {
  this.w = a;
  this.F = 0;
  this.p = 32768;
}
Tc.prototype.hc = function() {
  return this.w;
};
function Uc(a) {
  return a instanceof Tc;
}
function M(a) {
  return Tb(a);
}
var Vc = function() {
  function a(a, b, c, d) {
    for (var l = ub(a);;) {
      if (d < l) {
        var m = z.a(a, d);
        c = b.a ? b.a(c, m) : b.call(null, c, m);
        if (Uc(c)) {
          return Tb(c);
        }
        d += 1;
      } else {
        return c;
      }
    }
  }
  function b(a, b, c) {
    var d = ub(a), l = c;
    for (c = 0;;) {
      if (c < d) {
        var m = z.a(a, c), l = b.a ? b.a(l, m) : b.call(null, l, m);
        if (Uc(l)) {
          return Tb(l);
        }
        c += 1;
      } else {
        return l;
      }
    }
  }
  function c(a, b) {
    var c = ub(a);
    if (0 === c) {
      return b.C ? b.C() : b.call(null);
    }
    for (var d = z.a(a, 0), l = 1;;) {
      if (l < c) {
        var m = z.a(a, l), d = b.a ? b.a(d, m) : b.call(null, d, m);
        if (Uc(d)) {
          return Tb(d);
        }
        l += 1;
      } else {
        return d;
      }
    }
  }
  var d = null, d = function(d, f, h, k) {
    switch(arguments.length) {
      case 2:
        return c.call(this, d, f);
      case 3:
        return b.call(this, d, f, h);
      case 4:
        return a.call(this, d, f, h, k);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.a = c;
  d.g = b;
  d.v = a;
  return d;
}(), Wc = function() {
  function a(a, b, c, d) {
    for (var l = a.length;;) {
      if (d < l) {
        var m = a[d];
        c = b.a ? b.a(c, m) : b.call(null, c, m);
        if (Uc(c)) {
          return Tb(c);
        }
        d += 1;
      } else {
        return c;
      }
    }
  }
  function b(a, b, c) {
    var d = a.length, l = c;
    for (c = 0;;) {
      if (c < d) {
        var m = a[c], l = b.a ? b.a(l, m) : b.call(null, l, m);
        if (Uc(l)) {
          return Tb(l);
        }
        c += 1;
      } else {
        return l;
      }
    }
  }
  function c(a, b) {
    var c = a.length;
    if (0 === a.length) {
      return b.C ? b.C() : b.call(null);
    }
    for (var d = a[0], l = 1;;) {
      if (l < c) {
        var m = a[l], d = b.a ? b.a(d, m) : b.call(null, d, m);
        if (Uc(d)) {
          return Tb(d);
        }
        l += 1;
      } else {
        return d;
      }
    }
  }
  var d = null, d = function(d, f, h, k) {
    switch(arguments.length) {
      case 2:
        return c.call(this, d, f);
      case 3:
        return b.call(this, d, f, h);
      case 4:
        return a.call(this, d, f, h, k);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.a = c;
  d.g = b;
  d.v = a;
  return d;
}();
function Xc(a) {
  return a ? a.p & 2 || a.ie ? !0 : a.p ? !1 : u(tb, a) : u(tb, a);
}
function Yc(a) {
  return a ? a.p & 16 || a.Hd ? !0 : a.p ? !1 : u(yb, a) : u(yb, a);
}
function Zc(a, b) {
  this.h = a;
  this.A = b;
}
Zc.prototype.Qc = function() {
  return this.A < this.h.length;
};
Zc.prototype.next = function() {
  var a = this.h[this.A];
  this.A += 1;
  return a;
};
function Nc(a, b) {
  this.h = a;
  this.A = b;
  this.p = 166199550;
  this.F = 8192;
}
g = Nc.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.K = function(a, b) {
  var c = b + this.A;
  return c < this.h.length ? this.h[c] : null;
};
g.va = function(a, b, c) {
  a = b + this.A;
  return a < this.h.length ? this.h[a] : c;
};
g.ic = function() {
  return new Zc(this.h, this.A);
};
g.wa = function() {
  return new Nc(this.h, this.A);
};
g.pa = function() {
  return this.A + 1 < this.h.length ? new Nc(this.h, this.A + 1) : null;
};
g.ca = function() {
  return this.h.length - this.A;
};
g.J = function() {
  return Pc(this);
};
g.B = function(a, b) {
  return $c.a ? $c.a(this, b) : $c.call(null, this, b);
};
g.aa = function() {
  return J;
};
g.ha = function(a, b) {
  return Wc.v(this.h, b, this.h[this.A], this.A + 1);
};
g.ia = function(a, b, c) {
  return Wc.v(this.h, b, c, this.A);
};
g.ga = function() {
  return this.h[this.A];
};
g.ma = function() {
  return this.A + 1 < this.h.length ? new Nc(this.h, this.A + 1) : J;
};
g.X = function() {
  return this;
};
g.V = function(a, b) {
  return N.a ? N.a(b, this) : N.call(null, b, this);
};
var ad = function() {
  function a(a, b) {
    return b < a.length ? new Nc(a, b) : null;
  }
  function b(a) {
    return c.a(a, 0);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), L = function() {
  function a(a, b) {
    return ad.a(a, b);
  }
  function b(a) {
    return ad.a(a, 0);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function bd(a, b, c) {
  this.gc = a;
  this.A = b;
  this.o = c;
  this.p = 32374990;
  this.F = 8192;
}
g = bd.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new bd(this.gc, this.A, this.o);
};
g.pa = function() {
  return 0 < this.A ? new bd(this.gc, this.A - 1, null) : null;
};
g.ca = function() {
  return this.A + 1;
};
g.J = function() {
  return Pc(this);
};
g.B = function(a, b) {
  return $c.a ? $c.a(this, b) : $c.call(null, this, b);
};
g.aa = function() {
  var a = J, b = this.o;
  return cd.a ? cd.a(a, b) : cd.call(null, a, b);
};
g.ha = function(a, b) {
  return dd.a ? dd.a(b, this) : dd.call(null, b, this);
};
g.ia = function(a, b, c) {
  return dd.g ? dd.g(b, c, this) : dd.call(null, b, c, this);
};
g.ga = function() {
  return z.a(this.gc, this.A);
};
g.ma = function() {
  return 0 < this.A ? new bd(this.gc, this.A - 1, null) : J;
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new bd(this.gc, this.A, b);
};
g.V = function(a, b) {
  return N.a ? N.a(b, this) : N.call(null, b, this);
};
function ed(a) {
  return G(K(a));
}
ac._ = function(a, b) {
  return a === b;
};
var gd = function() {
  function a(a, b) {
    return null != a ? xb(a, b) : xb(J, b);
  }
  var b = null, c = function() {
    function a(b, d, k) {
      var l = null;
      2 < arguments.length && (l = L(Array.prototype.slice.call(arguments, 2), 0));
      return c.call(this, b, d, l);
    }
    function c(a, d, e) {
      for (;;) {
        if (t(e)) {
          a = b.a(a, d), d = G(e), e = K(e);
        } else {
          return b.a(a, d);
        }
      }
    }
    a.D = 2;
    a.s = function(a) {
      var b = G(a);
      a = K(a);
      var d = G(a);
      a = I(a);
      return c(b, d, a);
    };
    a.j = c;
    return a;
  }(), b = function(b, e, f) {
    switch(arguments.length) {
      case 0:
        return fd;
      case 1:
        return b;
      case 2:
        return a.call(this, b, e);
      default:
        return c.j(b, e, L(arguments, 2));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 2;
  b.s = c.s;
  b.C = function() {
    return fd;
  };
  b.e = function(a) {
    return a;
  };
  b.a = a;
  b.j = c.j;
  return b;
}();
function O(a) {
  if (null != a) {
    if (a && (a.p & 2 || a.ie)) {
      a = a.ca(null);
    } else {
      if (a instanceof Array) {
        a = a.length;
      } else {
        if ("string" === typeof a) {
          a = a.length;
        } else {
          if (u(tb, a)) {
            a = ub(a);
          } else {
            a: {
              a = F(a);
              for (var b = 0;;) {
                if (Xc(a)) {
                  a = b + ub(a);
                  break a;
                }
                a = K(a);
                b += 1;
              }
              a = void 0;
            }
          }
        }
      }
    }
  } else {
    a = 0;
  }
  return a;
}
var hd = function() {
  function a(a, b, c) {
    for (;;) {
      if (null == a) {
        return c;
      }
      if (0 === b) {
        return F(a) ? G(a) : c;
      }
      if (Yc(a)) {
        return z.g(a, b, c);
      }
      if (F(a)) {
        a = K(a), b -= 1;
      } else {
        return c;
      }
    }
  }
  function b(a, b) {
    for (;;) {
      if (null == a) {
        throw Error("Index out of bounds");
      }
      if (0 === b) {
        if (F(a)) {
          return G(a);
        }
        throw Error("Index out of bounds");
      }
      if (Yc(a)) {
        return z.a(a, b);
      }
      if (F(a)) {
        var c = K(a), h = b - 1;
        a = c;
        b = h;
      } else {
        throw Error("Index out of bounds");
      }
    }
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}(), Q = function() {
  function a(a, b, c) {
    if ("number" !== typeof b) {
      throw Error("index argument to nth must be a number.");
    }
    if (null == a) {
      return c;
    }
    if (a && (a.p & 16 || a.Hd)) {
      return a.va(null, b, c);
    }
    if (a instanceof Array || "string" === typeof a) {
      return b < a.length ? a[b] : c;
    }
    if (u(yb, a)) {
      return z.a(a, b);
    }
    if (a ? a.p & 64 || a.mc || (a.p ? 0 : u(zb, a)) : u(zb, a)) {
      return hd.g(a, b, c);
    }
    throw Error("nth not supported on this type " + x.e(kb(ib(a))));
  }
  function b(a, b) {
    if ("number" !== typeof b) {
      throw Error("index argument to nth must be a number");
    }
    if (null == a) {
      return a;
    }
    if (a && (a.p & 16 || a.Hd)) {
      return a.K(null, b);
    }
    if (a instanceof Array || "string" === typeof a) {
      return b < a.length ? a[b] : null;
    }
    if (u(yb, a)) {
      return z.a(a, b);
    }
    if (a ? a.p & 64 || a.mc || (a.p ? 0 : u(zb, a)) : u(zb, a)) {
      return hd.a(a, b);
    }
    throw Error("nth not supported on this type " + x.e(kb(ib(a))));
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}(), R = function() {
  function a(a, b, c) {
    return null != a ? a && (a.p & 256 || a.oe) ? a.H(null, b, c) : a instanceof Array ? b < a.length ? a[b] : c : "string" === typeof a ? b < a.length ? a[b] : c : u(Db, a) ? Eb.g(a, b, c) : c : c;
  }
  function b(a, b) {
    return null == a ? null : a && (a.p & 256 || a.oe) ? a.G(null, b) : a instanceof Array ? b < a.length ? a[b] : null : "string" === typeof a ? b < a.length ? a[b] : null : u(Db, a) ? Eb.a(a, b) : null;
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}(), jd = function() {
  function a(a, b, c) {
    return null != a ? Hb(a, b, c) : id([b], [c]);
  }
  var b = null, c = function() {
    function a(b, d, k, l) {
      var m = null;
      3 < arguments.length && (m = L(Array.prototype.slice.call(arguments, 3), 0));
      return c.call(this, b, d, k, m);
    }
    function c(a, d, e, l) {
      for (;;) {
        if (a = b.g(a, d, e), t(l)) {
          d = G(l), e = ed(l), l = K(K(l));
        } else {
          return a;
        }
      }
    }
    a.D = 3;
    a.s = function(a) {
      var b = G(a);
      a = K(a);
      var d = G(a);
      a = K(a);
      var l = G(a);
      a = I(a);
      return c(b, d, l, a);
    };
    a.j = c;
    return a;
  }(), b = function(b, e, f, h) {
    switch(arguments.length) {
      case 3:
        return a.call(this, b, e, f);
      default:
        return c.j(b, e, f, L(arguments, 3));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 3;
  b.s = c.s;
  b.g = a;
  b.j = c.j;
  return b;
}(), kd = function() {
  function a(a, b) {
    return null == a ? null : Jb(a, b);
  }
  var b = null, c = function() {
    function a(b, d, k) {
      var l = null;
      2 < arguments.length && (l = L(Array.prototype.slice.call(arguments, 2), 0));
      return c.call(this, b, d, l);
    }
    function c(a, d, e) {
      for (;;) {
        if (null == a) {
          return null;
        }
        a = b.a(a, d);
        if (t(e)) {
          d = G(e), e = K(e);
        } else {
          return a;
        }
      }
    }
    a.D = 2;
    a.s = function(a) {
      var b = G(a);
      a = K(a);
      var d = G(a);
      a = I(a);
      return c(b, d, a);
    };
    a.j = c;
    return a;
  }(), b = function(b, e, f) {
    switch(arguments.length) {
      case 1:
        return b;
      case 2:
        return a.call(this, b, e);
      default:
        return c.j(b, e, L(arguments, 2));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 2;
  b.s = c.s;
  b.e = function(a) {
    return a;
  };
  b.a = a;
  b.j = c.j;
  return b;
}();
function ld(a) {
  var b = ha(a);
  return t(b) ? b : a ? t(t(null) ? null : a.he) ? !0 : a.Mc ? !1 : u(pb, a) : u(pb, a);
}
function md(a, b) {
  this.k = a;
  this.o = b;
  this.F = 0;
  this.p = 393217;
}
g = md.prototype;
g.call = function() {
  function a(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H, ia, Ja) {
    a = this.k;
    return S.Gc ? S.Gc(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H, ia, Ja) : S.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H, ia, Ja);
  }
  function b(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H, ia) {
    a = this;
    return a.k.ib ? a.k.ib(b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H, ia) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H, ia);
  }
  function c(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H) {
    a = this;
    return a.k.hb ? a.k.hb(b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V, H);
  }
  function d(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V) {
    a = this;
    return a.k.gb ? a.k.gb(b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P, V);
  }
  function e(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P) {
    a = this;
    return a.k.fb ? a.k.fb(b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B, P);
  }
  function f(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B) {
    a = this;
    return a.k.eb ? a.k.eb(b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y, B);
  }
  function h(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y) {
    a = this;
    return a.k.cb ? a.k.cb(b, c, d, e, f, h, k, l, m, n, p, r, v, D, y) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v, D, y);
  }
  function k(a, b, c, d, e, f, h, k, l, m, n, p, r, v, D) {
    a = this;
    return a.k.bb ? a.k.bb(b, c, d, e, f, h, k, l, m, n, p, r, v, D) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v, D);
  }
  function l(a, b, c, d, e, f, h, k, l, m, n, p, r, v) {
    a = this;
    return a.k.ab ? a.k.ab(b, c, d, e, f, h, k, l, m, n, p, r, v) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r, v);
  }
  function m(a, b, c, d, e, f, h, k, l, m, n, p, r) {
    a = this;
    return a.k.$a ? a.k.$a(b, c, d, e, f, h, k, l, m, n, p, r) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p, r);
  }
  function n(a, b, c, d, e, f, h, k, l, m, n, p) {
    a = this;
    return a.k.Za ? a.k.Za(b, c, d, e, f, h, k, l, m, n, p) : a.k.call(null, b, c, d, e, f, h, k, l, m, n, p);
  }
  function p(a, b, c, d, e, f, h, k, l, m, n) {
    a = this;
    return a.k.Ya ? a.k.Ya(b, c, d, e, f, h, k, l, m, n) : a.k.call(null, b, c, d, e, f, h, k, l, m, n);
  }
  function r(a, b, c, d, e, f, h, k, l, m) {
    a = this;
    return a.k.kb ? a.k.kb(b, c, d, e, f, h, k, l, m) : a.k.call(null, b, c, d, e, f, h, k, l, m);
  }
  function v(a, b, c, d, e, f, h, k, l) {
    a = this;
    return a.k.jb ? a.k.jb(b, c, d, e, f, h, k, l) : a.k.call(null, b, c, d, e, f, h, k, l);
  }
  function y(a, b, c, d, e, f, h, k) {
    a = this;
    return a.k.Ga ? a.k.Ga(b, c, d, e, f, h, k) : a.k.call(null, b, c, d, e, f, h, k);
  }
  function B(a, b, c, d, e, f, h) {
    a = this;
    return a.k.xa ? a.k.xa(b, c, d, e, f, h) : a.k.call(null, b, c, d, e, f, h);
  }
  function D(a, b, c, d, e, f) {
    a = this;
    return a.k.Q ? a.k.Q(b, c, d, e, f) : a.k.call(null, b, c, d, e, f);
  }
  function P(a, b, c, d, e) {
    a = this;
    return a.k.v ? a.k.v(b, c, d, e) : a.k.call(null, b, c, d, e);
  }
  function V(a, b, c, d) {
    a = this;
    return a.k.g ? a.k.g(b, c, d) : a.k.call(null, b, c, d);
  }
  function ia(a, b, c) {
    a = this;
    return a.k.a ? a.k.a(b, c) : a.k.call(null, b, c);
  }
  function Ja(a, b) {
    a = this;
    return a.k.e ? a.k.e(b) : a.k.call(null, b);
  }
  function db(a) {
    a = this;
    return a.k.C ? a.k.C() : a.k.call(null);
  }
  var H = null, H = function(H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc, rd, je, Ye, Hg, Si, Zl) {
    switch(arguments.length) {
      case 1:
        return db.call(this, H);
      case 2:
        return Ja.call(this, H, wa);
      case 3:
        return ia.call(this, H, wa, Aa);
      case 4:
        return V.call(this, H, wa, Aa, Ha);
      case 5:
        return P.call(this, H, wa, Aa, Ha, Ia);
      case 6:
        return D.call(this, H, wa, Aa, Ha, Ia, Na);
      case 7:
        return B.call(this, H, wa, Aa, Ha, Ia, Na, Ta);
      case 8:
        return y.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya);
      case 9:
        return v.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb);
      case 10:
        return r.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb);
      case 11:
        return p.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb);
      case 12:
        return n.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb);
      case 13:
        return m.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb);
      case 14:
        return l.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc);
      case 15:
        return k.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc);
      case 16:
        return h.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc);
      case 17:
        return f.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc, rd);
      case 18:
        return e.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc, rd, je);
      case 19:
        return d.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc, rd, je, Ye);
      case 20:
        return c.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc, rd, je, Ye, Hg);
      case 21:
        return b.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc, rd, je, Ye, Hg, Si);
      case 22:
        return a.call(this, H, wa, Aa, Ha, Ia, Na, Ta, Ya, cb, jb, qb, Gb, Pb, cc, zc, Sc, rd, je, Ye, Hg, Si, Zl);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  H.e = db;
  H.a = Ja;
  H.g = ia;
  H.v = V;
  H.Q = P;
  H.xa = D;
  H.Ga = B;
  H.jb = y;
  H.kb = v;
  H.Ya = r;
  H.Za = p;
  H.$a = n;
  H.ab = m;
  H.bb = l;
  H.cb = k;
  H.eb = h;
  H.fb = f;
  H.gb = e;
  H.hb = d;
  H.ib = c;
  H.ne = b;
  H.Gc = a;
  return H;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.C = function() {
  return this.k.C ? this.k.C() : this.k.call(null);
};
g.e = function(a) {
  return this.k.e ? this.k.e(a) : this.k.call(null, a);
};
g.a = function(a, b) {
  return this.k.a ? this.k.a(a, b) : this.k.call(null, a, b);
};
g.g = function(a, b, c) {
  return this.k.g ? this.k.g(a, b, c) : this.k.call(null, a, b, c);
};
g.v = function(a, b, c, d) {
  return this.k.v ? this.k.v(a, b, c, d) : this.k.call(null, a, b, c, d);
};
g.Q = function(a, b, c, d, e) {
  return this.k.Q ? this.k.Q(a, b, c, d, e) : this.k.call(null, a, b, c, d, e);
};
g.xa = function(a, b, c, d, e, f) {
  return this.k.xa ? this.k.xa(a, b, c, d, e, f) : this.k.call(null, a, b, c, d, e, f);
};
g.Ga = function(a, b, c, d, e, f, h) {
  return this.k.Ga ? this.k.Ga(a, b, c, d, e, f, h) : this.k.call(null, a, b, c, d, e, f, h);
};
g.jb = function(a, b, c, d, e, f, h, k) {
  return this.k.jb ? this.k.jb(a, b, c, d, e, f, h, k) : this.k.call(null, a, b, c, d, e, f, h, k);
};
g.kb = function(a, b, c, d, e, f, h, k, l) {
  return this.k.kb ? this.k.kb(a, b, c, d, e, f, h, k, l) : this.k.call(null, a, b, c, d, e, f, h, k, l);
};
g.Ya = function(a, b, c, d, e, f, h, k, l, m) {
  return this.k.Ya ? this.k.Ya(a, b, c, d, e, f, h, k, l, m) : this.k.call(null, a, b, c, d, e, f, h, k, l, m);
};
g.Za = function(a, b, c, d, e, f, h, k, l, m, n) {
  return this.k.Za ? this.k.Za(a, b, c, d, e, f, h, k, l, m, n) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n);
};
g.$a = function(a, b, c, d, e, f, h, k, l, m, n, p) {
  return this.k.$a ? this.k.$a(a, b, c, d, e, f, h, k, l, m, n, p) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p);
};
g.ab = function(a, b, c, d, e, f, h, k, l, m, n, p, r) {
  return this.k.ab ? this.k.ab(a, b, c, d, e, f, h, k, l, m, n, p, r) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r);
};
g.bb = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v) {
  return this.k.bb ? this.k.bb(a, b, c, d, e, f, h, k, l, m, n, p, r, v) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v);
};
g.cb = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y) {
  return this.k.cb ? this.k.cb(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y);
};
g.eb = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B) {
  return this.k.eb ? this.k.eb(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B);
};
g.fb = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D) {
  return this.k.fb ? this.k.fb(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D);
};
g.gb = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P) {
  return this.k.gb ? this.k.gb(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P);
};
g.hb = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V) {
  return this.k.hb ? this.k.hb(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V);
};
g.ib = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia) {
  return this.k.ib ? this.k.ib(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia) : this.k.call(null, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia);
};
g.ne = function(a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja) {
  var db = this.k;
  return S.Gc ? S.Gc(db, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja) : S.call(null, db, a, b, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja);
};
g.he = !0;
g.Y = function(a, b) {
  return new md(this.k, b);
};
g.R = function() {
  return this.o;
};
function cd(a, b) {
  return ld(a) && !(a ? a.p & 262144 || a.ue || (a.p ? 0 : u(Wb, a)) : u(Wb, a)) ? new md(a, b) : null == a ? null : Xb(a, b);
}
function nd(a) {
  var b = null != a;
  return(b ? a ? a.p & 131072 || a.re || (a.p ? 0 : u(Ub, a)) : u(Ub, a) : b) ? Vb(a) : null;
}
function od(a) {
  return null == a || hb(F(a));
}
function pd(a) {
  return null == a ? !1 : a ? a.p & 8 || a.Ke ? !0 : a.p ? !1 : u(wb, a) : u(wb, a);
}
function qd(a) {
  return null == a ? !1 : a ? a.p & 4096 || a.Qe ? !0 : a.p ? !1 : u(Nb, a) : u(Nb, a);
}
function sd(a) {
  return null == a ? !1 : a ? a.p & 1024 || a.pe ? !0 : a.p ? !1 : u(Ib, a) : u(Ib, a);
}
function td(a) {
  return a ? a.p & 16384 || a.Re ? !0 : a.p ? !1 : u(Rb, a) : u(Rb, a);
}
function ud(a) {
  return a ? a.F & 512 || a.Je ? !0 : !1 : !1;
}
function vd(a) {
  var b = [];
  Da(a, function(a, b) {
    return function(a, c) {
      return b.push(c);
    };
  }(a, b));
  return b;
}
function wd(a, b, c, d, e) {
  for (;0 !== e;) {
    c[d] = a[b], d += 1, e -= 1, b += 1;
  }
}
function xd(a, b, c, d, e) {
  b += e - 1;
  for (d += e - 1;0 !== e;) {
    c[d] = a[b], d -= 1, e -= 1, b -= 1;
  }
}
var yd = {};
function zd(a) {
  return null == a ? !1 : a ? a.p & 64 || a.mc ? !0 : a.p ? !1 : u(zb, a) : u(zb, a);
}
function Ad(a) {
  return t(a) ? !0 : !1;
}
function Bd(a) {
  var b = ld(a);
  return b ? b : a ? a.p & 1 || a.Me ? !0 : a.p ? !1 : u(rb, a) : u(rb, a);
}
function Cd(a, b) {
  return R.g(a, b, yd) === yd ? !1 : !0;
}
function Lc(a, b) {
  if (a === b) {
    return 0;
  }
  if (null == a) {
    return-1;
  }
  if (null == b) {
    return 1;
  }
  if (ib(a) === ib(b)) {
    return a && (a.F & 2048 || a.Ec) ? a.Fc(null, b) : a > b ? 1 : a < b ? -1 : 0;
  }
  throw Error("compare on non-nil objects of different types");
}
var Dd = function() {
  function a(a, b, c, h) {
    for (;;) {
      var k = Lc(Q.a(a, h), Q.a(b, h));
      if (0 === k && h + 1 < c) {
        h += 1;
      } else {
        return k;
      }
    }
  }
  function b(a, b) {
    var f = O(a), h = O(b);
    return f < h ? -1 : f > h ? 1 : c.v(a, b, f, 0);
  }
  var c = null, c = function(c, e, f, h) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 4:
        return a.call(this, c, e, f, h);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.v = a;
  return c;
}(), dd = function() {
  function a(a, b, c) {
    for (c = F(c);;) {
      if (c) {
        var h = G(c);
        b = a.a ? a.a(b, h) : a.call(null, b, h);
        if (Uc(b)) {
          return Tb(b);
        }
        c = K(c);
      } else {
        return b;
      }
    }
  }
  function b(a, b) {
    var c = F(b);
    if (c) {
      var h = G(c), c = K(c);
      return nb.g ? nb.g(a, h, c) : nb.call(null, a, h, c);
    }
    return a.C ? a.C() : a.call(null);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}(), nb = function() {
  function a(a, b, c) {
    return c && (c.p & 524288 || c.te) ? c.ia(null, a, b) : c instanceof Array ? Wc.g(c, a, b) : "string" === typeof c ? Wc.g(c, a, b) : u(Yb, c) ? Zb.g(c, a, b) : dd.g(a, b, c);
  }
  function b(a, b) {
    return b && (b.p & 524288 || b.te) ? b.ha(null, a) : b instanceof Array ? Wc.a(b, a) : "string" === typeof b ? Wc.a(b, a) : u(Yb, b) ? Zb.a(b, a) : dd.a(a, b);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}();
function Ed(a, b, c) {
  return null != c ? $b(c, a, b) : b;
}
function Fd(a) {
  return a;
}
var Gd = function() {
  function a(a, b, c, h) {
    a = a.e ? a.e(b) : a.call(null, b);
    c = nb.g(a, c, h);
    return a.e ? a.e(c) : a.call(null, c);
  }
  function b(a, b, f) {
    return c.v(a, b, b.C ? b.C() : b.call(null), f);
  }
  var c = null, c = function(c, e, f, h) {
    switch(arguments.length) {
      case 3:
        return b.call(this, c, e, f);
      case 4:
        return a.call(this, c, e, f, h);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.g = b;
  c.v = a;
  return c;
}();
function Hd(a) {
  return a - 1;
}
function Id(a) {
  a = (a - a % 2) / 2;
  return 0 <= a ? Math.floor.e ? Math.floor.e(a) : Math.floor.call(null, a) : Math.ceil.e ? Math.ceil.e(a) : Math.ceil.call(null, a);
}
function Jd(a) {
  a -= a >> 1 & 1431655765;
  a = (a & 858993459) + (a >> 2 & 858993459);
  return 16843009 * (a + (a >> 4) & 252645135) >> 24;
}
var x = function() {
  function a(a) {
    return null == a ? "" : "" + a;
  }
  var b = null, c = function() {
    function a(b, d) {
      var k = null;
      1 < arguments.length && (k = L(Array.prototype.slice.call(arguments, 1), 0));
      return c.call(this, b, k);
    }
    function c(a, d) {
      for (var e = new La(b.e(a)), l = d;;) {
        if (t(l)) {
          e = e.append(b.e(G(l))), l = K(l);
        } else {
          return e.toString();
        }
      }
    }
    a.D = 1;
    a.s = function(a) {
      var b = G(a);
      a = I(a);
      return c(b, a);
    };
    a.j = c;
    return a;
  }(), b = function(b, e) {
    switch(arguments.length) {
      case 0:
        return "";
      case 1:
        return a.call(this, b);
      default:
        return c.j(b, L(arguments, 1));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 1;
  b.s = c.s;
  b.C = function() {
    return "";
  };
  b.e = a;
  b.j = c.j;
  return b;
}(), Kd = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return a.substring(c);
      case 3:
        return a.substring(c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return a.substring(c);
  };
  a.g = function(a, c, d) {
    return a.substring(c, d);
  };
  return a;
}();
function $c(a, b) {
  var c;
  if (b ? b.p & 16777216 || b.Pe || (b.p ? 0 : u(fc, b)) : u(fc, b)) {
    if (Xc(a) && Xc(b) && O(a) !== O(b)) {
      c = !1;
    } else {
      a: {
        c = F(a);
        for (var d = F(b);;) {
          if (null == c) {
            c = null == d;
            break a;
          }
          if (null != d && C.a(G(c), G(d))) {
            c = K(c), d = K(d);
          } else {
            c = !1;
            break a;
          }
        }
        c = void 0;
      }
    }
  } else {
    c = null;
  }
  return Ad(c);
}
function Ld(a, b, c, d, e) {
  this.o = a;
  this.first = b;
  this.Ua = c;
  this.count = d;
  this.q = e;
  this.p = 65937646;
  this.F = 8192;
}
g = Ld.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new Ld(this.o, this.first, this.Ua, this.count, this.q);
};
g.pa = function() {
  return 1 === this.count ? null : this.Ua;
};
g.ca = function() {
  return this.count;
};
g.tb = function() {
  return this.first;
};
g.ub = function() {
  return Bb(this);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return J;
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return this.first;
};
g.ma = function() {
  return 1 === this.count ? J : this.Ua;
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new Ld(b, this.first, this.Ua, this.count, this.q);
};
g.V = function(a, b) {
  return new Ld(this.o, b, this, this.count + 1, null);
};
function Md(a) {
  this.o = a;
  this.p = 65937614;
  this.F = 8192;
}
g = Md.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new Md(this.o);
};
g.pa = function() {
  return null;
};
g.ca = function() {
  return 0;
};
g.tb = function() {
  return null;
};
g.ub = function() {
  throw Error("Can't pop empty list");
};
g.J = function() {
  return 0;
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return this;
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return null;
};
g.ma = function() {
  return J;
};
g.X = function() {
  return null;
};
g.Y = function(a, b) {
  return new Md(b);
};
g.V = function(a, b) {
  return new Ld(this.o, b, null, 1, null);
};
var J = new Md(null), Nd = function() {
  function a(a) {
    var d = null;
    0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
    return b.call(this, d);
  }
  function b(a) {
    var b;
    if (a instanceof Nc && 0 === a.A) {
      b = a.h;
    } else {
      a: {
        for (b = [];;) {
          if (null != a) {
            b.push(a.ga(null)), a = a.pa(null);
          } else {
            break a;
          }
        }
        b = void 0;
      }
    }
    a = b.length;
    for (var e = J;;) {
      if (0 < a) {
        var f = a - 1, e = e.V(null, b[a - 1]);
        a = f;
      } else {
        return e;
      }
    }
  }
  a.D = 0;
  a.s = function(a) {
    a = F(a);
    return b(a);
  };
  a.j = b;
  return a;
}();
function Od(a, b, c, d) {
  this.o = a;
  this.first = b;
  this.Ua = c;
  this.q = d;
  this.p = 65929452;
  this.F = 8192;
}
g = Od.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new Od(this.o, this.first, this.Ua, this.q);
};
g.pa = function() {
  return null == this.Ua ? null : F(this.Ua);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return this.first;
};
g.ma = function() {
  return null == this.Ua ? J : this.Ua;
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new Od(b, this.first, this.Ua, this.q);
};
g.V = function(a, b) {
  return new Od(null, b, this, this.q);
};
function N(a, b) {
  var c = null == b;
  return(c ? c : b && (b.p & 64 || b.mc)) ? new Od(null, a, b, null) : new Od(null, a, F(b), null);
}
function T(a, b, c, d) {
  this.Sa = a;
  this.name = b;
  this.Da = c;
  this.Lb = d;
  this.p = 2153775105;
  this.F = 4096;
}
g = T.prototype;
g.L = function(a, b) {
  return A(b, ":" + x.e(this.Da));
};
g.J = function() {
  var a = this.Lb;
  return null != a ? a : this.Lb = a = Jc(Ec(this.name), Hc(this.Sa)) + 2654435769 | 0;
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return R.a(c, this);
      case 3:
        return R.g(c, this, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return R.a(c, this);
  };
  a.g = function(a, c, d) {
    return R.g(c, this, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return R.a(a, this);
};
g.a = function(a, b) {
  return R.g(a, this, b);
};
g.B = function(a, b) {
  return b instanceof T ? this.Da === b.Da : !1;
};
g.toString = function() {
  return ":" + x.e(this.Da);
};
g.equiv = function(a) {
  return this.B(null, a);
};
function Pd(a, b) {
  return a === b ? !0 : a instanceof T && b instanceof T ? a.Da === b.Da : !1;
}
var Rd = function() {
  function a(a, b) {
    return new T(a, b, "" + x.e(t(a) ? "" + x.e(a) + "/" : null) + x.e(b), null);
  }
  function b(a) {
    if (a instanceof T) {
      return a;
    }
    if (a instanceof E) {
      var b;
      if (a && (a.F & 4096 || a.se)) {
        b = a.Sa;
      } else {
        throw Error("Doesn't support namespace: " + x.e(a));
      }
      return new T(b, Qd.e ? Qd.e(a) : Qd.call(null, a), a.Ba, null);
    }
    return "string" === typeof a ? (b = a.split("/"), 2 === b.length ? new T(b[0], b[1], a, null) : new T(null, b[0], a, null)) : null;
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function Sd(a, b, c, d) {
  this.o = a;
  this.Tb = b;
  this.I = c;
  this.q = d;
  this.F = 0;
  this.p = 32374988;
}
g = Sd.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
function Td(a) {
  null != a.Tb && (a.I = a.Tb.C ? a.Tb.C() : a.Tb.call(null), a.Tb = null);
  return a.I;
}
g.R = function() {
  return this.o;
};
g.pa = function() {
  ec(this);
  return null == this.I ? null : K(this.I);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  ec(this);
  return null == this.I ? null : G(this.I);
};
g.ma = function() {
  ec(this);
  return null != this.I ? I(this.I) : J;
};
g.X = function() {
  Td(this);
  if (null == this.I) {
    return null;
  }
  for (var a = this.I;;) {
    if (a instanceof Sd) {
      a = Td(a);
    } else {
      return this.I = a, F(this.I);
    }
  }
};
g.Y = function(a, b) {
  return new Sd(b, this.Tb, this.I, this.q);
};
g.V = function(a, b) {
  return N(b, this);
};
function Ud(a, b) {
  this.ed = a;
  this.end = b;
  this.F = 0;
  this.p = 2;
}
Ud.prototype.ca = function() {
  return this.end;
};
Ud.prototype.add = function(a) {
  this.ed[this.end] = a;
  return this.end += 1;
};
Ud.prototype.Fa = function() {
  var a = new Vd(this.ed, 0, this.end);
  this.ed = null;
  return a;
};
function Vd(a, b, c) {
  this.h = a;
  this.oa = b;
  this.end = c;
  this.F = 0;
  this.p = 524306;
}
g = Vd.prototype;
g.ha = function(a, b) {
  return Wc.v(this.h, b, this.h[this.oa], this.oa + 1);
};
g.ia = function(a, b, c) {
  return Wc.v(this.h, b, c, this.oa);
};
g.Gd = function() {
  if (this.oa === this.end) {
    throw Error("-drop-first of empty chunk");
  }
  return new Vd(this.h, this.oa + 1, this.end);
};
g.K = function(a, b) {
  return this.h[this.oa + b];
};
g.va = function(a, b, c) {
  return 0 <= b && b < this.end - this.oa ? this.h[this.oa + b] : c;
};
g.ca = function() {
  return this.end - this.oa;
};
var Wd = function() {
  function a(a, b, c) {
    return new Vd(a, b, c);
  }
  function b(a, b) {
    return new Vd(a, b, a.length);
  }
  function c(a) {
    return new Vd(a, 0, a.length);
  }
  var d = null, d = function(d, f, h) {
    switch(arguments.length) {
      case 1:
        return c.call(this, d);
      case 2:
        return b.call(this, d, f);
      case 3:
        return a.call(this, d, f, h);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.e = c;
  d.a = b;
  d.g = a;
  return d;
}();
function Xd(a, b, c, d) {
  this.Fa = a;
  this.Wa = b;
  this.o = c;
  this.q = d;
  this.p = 31850732;
  this.F = 1536;
}
g = Xd.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.pa = function() {
  if (1 < ub(this.Fa)) {
    return new Xd(qc(this.Fa), this.Wa, this.o, null);
  }
  var a = ec(this.Wa);
  return null == a ? null : a;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ga = function() {
  return z.a(this.Fa, 0);
};
g.ma = function() {
  return 1 < ub(this.Fa) ? new Xd(qc(this.Fa), this.Wa, this.o, null) : null == this.Wa ? J : this.Wa;
};
g.X = function() {
  return this;
};
g.hd = function() {
  return this.Fa;
};
g.jd = function() {
  return null == this.Wa ? J : this.Wa;
};
g.Y = function(a, b) {
  return new Xd(this.Fa, this.Wa, b, this.q);
};
g.V = function(a, b) {
  return N(b, this);
};
g.gd = function() {
  return null == this.Wa ? null : this.Wa;
};
function Yd(a, b) {
  return 0 === ub(a) ? b : new Xd(a, b, null, null);
}
function Zd(a, b) {
  a.add(b);
}
function $d(a) {
  for (var b = [];;) {
    if (F(a)) {
      b.push(G(a)), a = K(a);
    } else {
      return b;
    }
  }
}
function ae(a, b) {
  if (Xc(a)) {
    return O(a);
  }
  for (var c = a, d = b, e = 0;;) {
    if (0 < d && F(c)) {
      c = K(c), d -= 1, e += 1;
    } else {
      return e;
    }
  }
}
var ce = function be(b) {
  return null == b ? null : null == K(b) ? F(G(b)) : N(G(b), be(K(b)));
}, de = function() {
  function a(a, b) {
    return new Sd(null, function() {
      var c = F(a);
      return c ? ud(c) ? Yd(rc(c), d.a(sc(c), b)) : N(G(c), d.a(I(c), b)) : b;
    }, null, null);
  }
  function b(a) {
    return new Sd(null, function() {
      return a;
    }, null, null);
  }
  function c() {
    return new Sd(null, function() {
      return null;
    }, null, null);
  }
  var d = null, e = function() {
    function a(c, d, e) {
      var f = null;
      2 < arguments.length && (f = L(Array.prototype.slice.call(arguments, 2), 0));
      return b.call(this, c, d, f);
    }
    function b(a, c, e) {
      return function p(a, b) {
        return new Sd(null, function() {
          var c = F(a);
          return c ? ud(c) ? Yd(rc(c), p(sc(c), b)) : N(G(c), p(I(c), b)) : t(b) ? p(G(b), K(b)) : null;
        }, null, null);
      }(d.a(a, c), e);
    }
    a.D = 2;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = I(a);
      return b(c, d, a);
    };
    a.j = b;
    return a;
  }(), d = function(d, h, k) {
    switch(arguments.length) {
      case 0:
        return c.call(this);
      case 1:
        return b.call(this, d);
      case 2:
        return a.call(this, d, h);
      default:
        return e.j(d, h, L(arguments, 2));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.D = 2;
  d.s = e.s;
  d.C = c;
  d.e = b;
  d.a = a;
  d.j = e.j;
  return d;
}(), ee = function() {
  function a(a, b, c, d) {
    return N(a, N(b, N(c, d)));
  }
  function b(a, b, c) {
    return N(a, N(b, c));
  }
  var c = null, d = function() {
    function a(c, d, e, m, n) {
      var p = null;
      4 < arguments.length && (p = L(Array.prototype.slice.call(arguments, 4), 0));
      return b.call(this, c, d, e, m, p);
    }
    function b(a, c, d, e, f) {
      return N(a, N(c, N(d, N(e, ce(f)))));
    }
    a.D = 4;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = K(a);
      var e = G(a);
      a = K(a);
      var n = G(a);
      a = I(a);
      return b(c, d, e, n, a);
    };
    a.j = b;
    return a;
  }(), c = function(c, f, h, k, l) {
    switch(arguments.length) {
      case 1:
        return F(c);
      case 2:
        return N(c, f);
      case 3:
        return b.call(this, c, f, h);
      case 4:
        return a.call(this, c, f, h, k);
      default:
        return d.j(c, f, h, k, L(arguments, 4));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.D = 4;
  c.s = d.s;
  c.e = function(a) {
    return F(a);
  };
  c.a = function(a, b) {
    return N(a, b);
  };
  c.g = b;
  c.v = a;
  c.j = d.j;
  return c;
}(), fe = function() {
  function a() {
    return lc(fd);
  }
  var b = null, c = function() {
    function a(c, d, k) {
      var l = null;
      2 < arguments.length && (l = L(Array.prototype.slice.call(arguments, 2), 0));
      return b.call(this, c, d, l);
    }
    function b(a, c, d) {
      for (;;) {
        if (a = mc(a, c), t(d)) {
          c = G(d), d = K(d);
        } else {
          return a;
        }
      }
    }
    a.D = 2;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = I(a);
      return b(c, d, a);
    };
    a.j = b;
    return a;
  }(), b = function(b, e, f) {
    switch(arguments.length) {
      case 0:
        return a.call(this);
      case 1:
        return b;
      case 2:
        return mc(b, e);
      default:
        return c.j(b, e, L(arguments, 2));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 2;
  b.s = c.s;
  b.C = a;
  b.e = function(a) {
    return a;
  };
  b.a = function(a, b) {
    return mc(a, b);
  };
  b.j = c.j;
  return b;
}(), ge = function() {
  var a = null, b = function() {
    function a(c, f, h, k) {
      var l = null;
      3 < arguments.length && (l = L(Array.prototype.slice.call(arguments, 3), 0));
      return b.call(this, c, f, h, l);
    }
    function b(a, c, d, k) {
      for (;;) {
        if (a = oc(a, c, d), t(k)) {
          c = G(k), d = ed(k), k = K(K(k));
        } else {
          return a;
        }
      }
    }
    a.D = 3;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var h = G(a);
      a = K(a);
      var k = G(a);
      a = I(a);
      return b(c, h, k, a);
    };
    a.j = b;
    return a;
  }(), a = function(a, d, e, f) {
    switch(arguments.length) {
      case 3:
        return oc(a, d, e);
      default:
        return b.j(a, d, e, L(arguments, 3));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.D = 3;
  a.s = b.s;
  a.g = function(a, b, e) {
    return oc(a, b, e);
  };
  a.j = b.j;
  return a;
}();
function he(a, b, c) {
  var d = F(c);
  if (0 === b) {
    return a.C ? a.C() : a.call(null);
  }
  c = Ab(d);
  var e = Bb(d);
  if (1 === b) {
    return a.e ? a.e(c) : a.e ? a.e(c) : a.call(null, c);
  }
  var d = Ab(e), f = Bb(e);
  if (2 === b) {
    return a.a ? a.a(c, d) : a.a ? a.a(c, d) : a.call(null, c, d);
  }
  var e = Ab(f), h = Bb(f);
  if (3 === b) {
    return a.g ? a.g(c, d, e) : a.g ? a.g(c, d, e) : a.call(null, c, d, e);
  }
  var f = Ab(h), k = Bb(h);
  if (4 === b) {
    return a.v ? a.v(c, d, e, f) : a.v ? a.v(c, d, e, f) : a.call(null, c, d, e, f);
  }
  var h = Ab(k), l = Bb(k);
  if (5 === b) {
    return a.Q ? a.Q(c, d, e, f, h) : a.Q ? a.Q(c, d, e, f, h) : a.call(null, c, d, e, f, h);
  }
  var k = Ab(l), m = Bb(l);
  if (6 === b) {
    return a.xa ? a.xa(c, d, e, f, h, k) : a.xa ? a.xa(c, d, e, f, h, k) : a.call(null, c, d, e, f, h, k);
  }
  var l = Ab(m), n = Bb(m);
  if (7 === b) {
    return a.Ga ? a.Ga(c, d, e, f, h, k, l) : a.Ga ? a.Ga(c, d, e, f, h, k, l) : a.call(null, c, d, e, f, h, k, l);
  }
  var m = Ab(n), p = Bb(n);
  if (8 === b) {
    return a.jb ? a.jb(c, d, e, f, h, k, l, m) : a.jb ? a.jb(c, d, e, f, h, k, l, m) : a.call(null, c, d, e, f, h, k, l, m);
  }
  var n = Ab(p), r = Bb(p);
  if (9 === b) {
    return a.kb ? a.kb(c, d, e, f, h, k, l, m, n) : a.kb ? a.kb(c, d, e, f, h, k, l, m, n) : a.call(null, c, d, e, f, h, k, l, m, n);
  }
  var p = Ab(r), v = Bb(r);
  if (10 === b) {
    return a.Ya ? a.Ya(c, d, e, f, h, k, l, m, n, p) : a.Ya ? a.Ya(c, d, e, f, h, k, l, m, n, p) : a.call(null, c, d, e, f, h, k, l, m, n, p);
  }
  var r = Ab(v), y = Bb(v);
  if (11 === b) {
    return a.Za ? a.Za(c, d, e, f, h, k, l, m, n, p, r) : a.Za ? a.Za(c, d, e, f, h, k, l, m, n, p, r) : a.call(null, c, d, e, f, h, k, l, m, n, p, r);
  }
  var v = Ab(y), B = Bb(y);
  if (12 === b) {
    return a.$a ? a.$a(c, d, e, f, h, k, l, m, n, p, r, v) : a.$a ? a.$a(c, d, e, f, h, k, l, m, n, p, r, v) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v);
  }
  var y = Ab(B), D = Bb(B);
  if (13 === b) {
    return a.ab ? a.ab(c, d, e, f, h, k, l, m, n, p, r, v, y) : a.ab ? a.ab(c, d, e, f, h, k, l, m, n, p, r, v, y) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y);
  }
  var B = Ab(D), P = Bb(D);
  if (14 === b) {
    return a.bb ? a.bb(c, d, e, f, h, k, l, m, n, p, r, v, y, B) : a.bb ? a.bb(c, d, e, f, h, k, l, m, n, p, r, v, y, B) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y, B);
  }
  var D = Ab(P), V = Bb(P);
  if (15 === b) {
    return a.cb ? a.cb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D) : a.cb ? a.cb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D);
  }
  var P = Ab(V), ia = Bb(V);
  if (16 === b) {
    return a.eb ? a.eb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P) : a.eb ? a.eb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P);
  }
  var V = Ab(ia), Ja = Bb(ia);
  if (17 === b) {
    return a.fb ? a.fb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V) : a.fb ? a.fb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V);
  }
  var ia = Ab(Ja), db = Bb(Ja);
  if (18 === b) {
    return a.gb ? a.gb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia) : a.gb ? a.gb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia);
  }
  Ja = Ab(db);
  db = Bb(db);
  if (19 === b) {
    return a.hb ? a.hb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja) : a.hb ? a.hb(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja);
  }
  var H = Ab(db);
  Bb(db);
  if (20 === b) {
    return a.ib ? a.ib(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja, H) : a.ib ? a.ib(c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja, H) : a.call(null, c, d, e, f, h, k, l, m, n, p, r, v, y, B, D, P, V, ia, Ja, H);
  }
  throw Error("Only up to 20 arguments supported on functions");
}
var S = function() {
  function a(a, b, c, d, e) {
    b = ee.v(b, c, d, e);
    c = a.D;
    return a.s ? (d = ae(b, c + 1), d <= c ? he(a, d, b) : a.s(b)) : a.apply(a, $d(b));
  }
  function b(a, b, c, d) {
    b = ee.g(b, c, d);
    c = a.D;
    return a.s ? (d = ae(b, c + 1), d <= c ? he(a, d, b) : a.s(b)) : a.apply(a, $d(b));
  }
  function c(a, b, c) {
    b = ee.a(b, c);
    c = a.D;
    if (a.s) {
      var d = ae(b, c + 1);
      return d <= c ? he(a, d, b) : a.s(b);
    }
    return a.apply(a, $d(b));
  }
  function d(a, b) {
    var c = a.D;
    if (a.s) {
      var d = ae(b, c + 1);
      return d <= c ? he(a, d, b) : a.s(b);
    }
    return a.apply(a, $d(b));
  }
  var e = null, f = function() {
    function a(c, d, e, f, h, v) {
      var y = null;
      5 < arguments.length && (y = L(Array.prototype.slice.call(arguments, 5), 0));
      return b.call(this, c, d, e, f, h, y);
    }
    function b(a, c, d, e, f, h) {
      c = N(c, N(d, N(e, N(f, ce(h)))));
      d = a.D;
      return a.s ? (e = ae(c, d + 1), e <= d ? he(a, e, c) : a.s(c)) : a.apply(a, $d(c));
    }
    a.D = 5;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = K(a);
      var e = G(a);
      a = K(a);
      var f = G(a);
      a = K(a);
      var h = G(a);
      a = I(a);
      return b(c, d, e, f, h, a);
    };
    a.j = b;
    return a;
  }(), e = function(e, k, l, m, n, p) {
    switch(arguments.length) {
      case 2:
        return d.call(this, e, k);
      case 3:
        return c.call(this, e, k, l);
      case 4:
        return b.call(this, e, k, l, m);
      case 5:
        return a.call(this, e, k, l, m, n);
      default:
        return f.j(e, k, l, m, n, L(arguments, 5));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  e.D = 5;
  e.s = f.s;
  e.a = d;
  e.g = c;
  e.v = b;
  e.Q = a;
  e.j = f.j;
  return e;
}(), ie = function() {
  function a(a, b) {
    return!C.a(a, b);
  }
  var b = null, c = function() {
    function a(c, d, k) {
      var l = null;
      2 < arguments.length && (l = L(Array.prototype.slice.call(arguments, 2), 0));
      return b.call(this, c, d, l);
    }
    function b(a, c, d) {
      return hb(S.v(C, a, c, d));
    }
    a.D = 2;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = I(a);
      return b(c, d, a);
    };
    a.j = b;
    return a;
  }(), b = function(b, e, f) {
    switch(arguments.length) {
      case 1:
        return!1;
      case 2:
        return a.call(this, b, e);
      default:
        return c.j(b, e, L(arguments, 2));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 2;
  b.s = c.s;
  b.e = function() {
    return!1;
  };
  b.a = a;
  b.j = c.j;
  return b;
}();
function ke(a, b) {
  for (;;) {
    if (null == F(b)) {
      return!0;
    }
    var c;
    c = G(b);
    c = a.e ? a.e(c) : a.call(null, c);
    if (t(c)) {
      c = a;
      var d = K(b);
      a = c;
      b = d;
    } else {
      return!1;
    }
  }
}
function le(a, b) {
  for (;;) {
    if (F(b)) {
      var c;
      c = G(b);
      c = a.e ? a.e(c) : a.call(null, c);
      if (t(c)) {
        return c;
      }
      c = a;
      var d = K(b);
      a = c;
      b = d;
    } else {
      return null;
    }
  }
}
var me = function() {
  function a(a, b, c, d) {
    return function() {
      function e(a) {
        var b = null;
        0 < arguments.length && (b = L(Array.prototype.slice.call(arguments, 0), 0));
        return n.call(this, b);
      }
      function n(e) {
        return S.Q(a, b, c, d, e);
      }
      e.D = 0;
      e.s = function(a) {
        a = F(a);
        return n(a);
      };
      e.j = n;
      return e;
    }();
  }
  function b(a, b, c) {
    return function() {
      function d(a) {
        var b = null;
        0 < arguments.length && (b = L(Array.prototype.slice.call(arguments, 0), 0));
        return e.call(this, b);
      }
      function e(d) {
        return S.v(a, b, c, d);
      }
      d.D = 0;
      d.s = function(a) {
        a = F(a);
        return e(a);
      };
      d.j = e;
      return d;
    }();
  }
  function c(a, b) {
    return function() {
      function c(a) {
        var b = null;
        0 < arguments.length && (b = L(Array.prototype.slice.call(arguments, 0), 0));
        return d.call(this, b);
      }
      function d(c) {
        return S.g(a, b, c);
      }
      c.D = 0;
      c.s = function(a) {
        a = F(a);
        return d(a);
      };
      c.j = d;
      return c;
    }();
  }
  var d = null, e = function() {
    function a(c, d, e, f, p) {
      var r = null;
      4 < arguments.length && (r = L(Array.prototype.slice.call(arguments, 4), 0));
      return b.call(this, c, d, e, f, r);
    }
    function b(a, c, d, e, f) {
      return function() {
        function b(a) {
          var c = null;
          0 < arguments.length && (c = L(Array.prototype.slice.call(arguments, 0), 0));
          return h.call(this, c);
        }
        function h(b) {
          return S.Q(a, c, d, e, de.a(f, b));
        }
        b.D = 0;
        b.s = function(a) {
          a = F(a);
          return h(a);
        };
        b.j = h;
        return b;
      }();
    }
    a.D = 4;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = K(a);
      var e = G(a);
      a = K(a);
      var f = G(a);
      a = I(a);
      return b(c, d, e, f, a);
    };
    a.j = b;
    return a;
  }(), d = function(d, h, k, l, m) {
    switch(arguments.length) {
      case 1:
        return d;
      case 2:
        return c.call(this, d, h);
      case 3:
        return b.call(this, d, h, k);
      case 4:
        return a.call(this, d, h, k, l);
      default:
        return e.j(d, h, k, l, L(arguments, 4));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.D = 4;
  d.s = e.s;
  d.e = function(a) {
    return a;
  };
  d.a = c;
  d.g = b;
  d.v = a;
  d.j = e.j;
  return d;
}();
function ne(a, b, c, d) {
  this.state = a;
  this.o = b;
  this.cc = c;
  this.la = d;
  this.p = 6455296;
  this.F = 16386;
}
g = ne.prototype;
g.J = function() {
  return ja(this);
};
g.Kc = function(a, b, c) {
  for (var d = F(this.la), e = null, f = 0, h = 0;;) {
    if (h < f) {
      a = e.K(null, h);
      var k = Q.g(a, 0, null);
      a = Q.g(a, 1, null);
      var l = b, m = c;
      a.v ? a.v(k, this, l, m) : a.call(null, k, this, l, m);
      h += 1;
    } else {
      if (a = F(d)) {
        d = a, ud(d) ? (e = rc(d), d = sc(d), a = e, f = O(e), e = a) : (a = G(d), k = Q.g(a, 0, null), a = Q.g(a, 1, null), e = k, f = b, h = c, a.v ? a.v(e, this, f, h) : a.call(null, e, this, f, h), d = K(d), e = null, f = 0), h = 0;
      } else {
        return null;
      }
    }
  }
};
g.Jc = function(a, b, c) {
  this.la = jd.g(this.la, b, c);
  return this;
};
g.Lc = function(a, b) {
  return this.la = kd.a(this.la, b);
};
g.R = function() {
  return this.o;
};
g.hc = function() {
  return this.state;
};
g.B = function(a, b) {
  return this === b;
};
g.equiv = function(a) {
  return this.B(null, a);
};
var qe = function() {
  function a(a) {
    return new ne(a, null, null, null);
  }
  var b = null, c = function() {
    function a(c, d) {
      var k = null;
      1 < arguments.length && (k = L(Array.prototype.slice.call(arguments, 1), 0));
      return b.call(this, c, k);
    }
    function b(a, c) {
      var d = zd(c) ? S.a(oe, c) : c, e = R.a(d, pe), d = R.a(d, eb);
      return new ne(a, d, e, null);
    }
    a.D = 1;
    a.s = function(a) {
      var c = G(a);
      a = I(a);
      return b(c, a);
    };
    a.j = b;
    return a;
  }(), b = function(b, e) {
    switch(arguments.length) {
      case 1:
        return a.call(this, b);
      default:
        return c.j(b, L(arguments, 1));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 1;
  b.s = c.s;
  b.e = a;
  b.j = c.j;
  return b;
}();
function re(a, b) {
  if (a instanceof ne) {
    var c = a.cc;
    if (null != c && !t(c.e ? c.e(b) : c.call(null, b))) {
      throw Error("Assert failed: Validator rejected reference state\n" + x.e(function() {
        var a = Nd(new E(null, "validate", "validate", 1439230700, null), new E(null, "new-value", "new-value", -1567397401, null));
        return se.e ? se.e(a) : se.call(null, a);
      }()));
    }
    c = a.state;
    a.state = b;
    null != a.la && ic(a, c, b);
    return b;
  }
  return uc(a, b);
}
var te = function() {
  function a(a, b, c, d) {
    if (a instanceof ne) {
      var e = a.state;
      b = b.g ? b.g(e, c, d) : b.call(null, e, c, d);
      a = re(a, b);
    } else {
      a = vc.v(a, b, c, d);
    }
    return a;
  }
  function b(a, b, c) {
    if (a instanceof ne) {
      var d = a.state;
      b = b.a ? b.a(d, c) : b.call(null, d, c);
      a = re(a, b);
    } else {
      a = vc.g(a, b, c);
    }
    return a;
  }
  function c(a, b) {
    var c;
    a instanceof ne ? (c = a.state, c = b.e ? b.e(c) : b.call(null, c), c = re(a, c)) : c = vc.a(a, b);
    return c;
  }
  var d = null, e = function() {
    function a(c, d, e, f, p) {
      var r = null;
      4 < arguments.length && (r = L(Array.prototype.slice.call(arguments, 4), 0));
      return b.call(this, c, d, e, f, r);
    }
    function b(a, c, d, e, f) {
      return a instanceof ne ? re(a, S.Q(c, a.state, d, e, f)) : vc.Q(a, c, d, e, f);
    }
    a.D = 4;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = K(a);
      var e = G(a);
      a = K(a);
      var f = G(a);
      a = I(a);
      return b(c, d, e, f, a);
    };
    a.j = b;
    return a;
  }(), d = function(d, h, k, l, m) {
    switch(arguments.length) {
      case 2:
        return c.call(this, d, h);
      case 3:
        return b.call(this, d, h, k);
      case 4:
        return a.call(this, d, h, k, l);
      default:
        return e.j(d, h, k, l, L(arguments, 4));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.D = 4;
  d.s = e.s;
  d.a = c;
  d.g = b;
  d.v = a;
  d.j = e.j;
  return d;
}(), ue = function() {
  function a(a, b, c, d) {
    return new Sd(null, function() {
      var f = F(b), p = F(c), r = F(d);
      if (f && p && r) {
        var v = N, y;
        y = G(f);
        var B = G(p), D = G(r);
        y = a.g ? a.g(y, B, D) : a.call(null, y, B, D);
        f = v(y, e.v(a, I(f), I(p), I(r)));
      } else {
        f = null;
      }
      return f;
    }, null, null);
  }
  function b(a, b, c) {
    return new Sd(null, function() {
      var d = F(b), f = F(c);
      if (d && f) {
        var p = N, r;
        r = G(d);
        var v = G(f);
        r = a.a ? a.a(r, v) : a.call(null, r, v);
        d = p(r, e.g(a, I(d), I(f)));
      } else {
        d = null;
      }
      return d;
    }, null, null);
  }
  function c(a, b) {
    return new Sd(null, function() {
      var c = F(b);
      if (c) {
        if (ud(c)) {
          for (var d = rc(c), f = O(d), p = new Ud(Array(f), 0), r = 0;;) {
            if (r < f) {
              Zd(p, function() {
                var b = z.a(d, r);
                return a.e ? a.e(b) : a.call(null, b);
              }()), r += 1;
            } else {
              break;
            }
          }
          return Yd(p.Fa(), e.a(a, sc(c)));
        }
        return N(function() {
          var b = G(c);
          return a.e ? a.e(b) : a.call(null, b);
        }(), e.a(a, I(c)));
      }
      return null;
    }, null, null);
  }
  function d(a) {
    return function(b) {
      return function() {
        function c(d, e) {
          var f = a.e ? a.e(e) : a.call(null, e);
          return b.a ? b.a(d, f) : b.call(null, d, f);
        }
        function d(a) {
          return b.e ? b.e(a) : b.call(null, a);
        }
        function e() {
          return b.C ? b.C() : b.call(null);
        }
        var f = null, r = function() {
          function c(a, b, e) {
            var f = null;
            2 < arguments.length && (f = L(Array.prototype.slice.call(arguments, 2), 0));
            return d.call(this, a, b, f);
          }
          function d(c, e, f) {
            e = S.g(a, e, f);
            return b.a ? b.a(c, e) : b.call(null, c, e);
          }
          c.D = 2;
          c.s = function(a) {
            var b = G(a);
            a = K(a);
            var c = G(a);
            a = I(a);
            return d(b, c, a);
          };
          c.j = d;
          return c;
        }(), f = function(a, b, f) {
          switch(arguments.length) {
            case 0:
              return e.call(this);
            case 1:
              return d.call(this, a);
            case 2:
              return c.call(this, a, b);
            default:
              return r.j(a, b, L(arguments, 2));
          }
          throw Error("Invalid arity: " + arguments.length);
        };
        f.D = 2;
        f.s = r.s;
        f.C = e;
        f.e = d;
        f.a = c;
        f.j = r.j;
        return f;
      }();
    };
  }
  var e = null, f = function() {
    function a(c, d, e, f, h) {
      var v = null;
      4 < arguments.length && (v = L(Array.prototype.slice.call(arguments, 4), 0));
      return b.call(this, c, d, e, f, v);
    }
    function b(a, c, d, f, h) {
      var k = function B(a) {
        return new Sd(null, function() {
          var b = e.a(F, a);
          return ke(Fd, b) ? N(e.a(G, b), B(e.a(I, b))) : null;
        }, null, null);
      };
      return e.a(function() {
        return function(b) {
          return S.a(a, b);
        };
      }(k), k(gd.j(h, f, L([d, c], 0))));
    }
    a.D = 4;
    a.s = function(a) {
      var c = G(a);
      a = K(a);
      var d = G(a);
      a = K(a);
      var e = G(a);
      a = K(a);
      var f = G(a);
      a = I(a);
      return b(c, d, e, f, a);
    };
    a.j = b;
    return a;
  }(), e = function(e, k, l, m, n) {
    switch(arguments.length) {
      case 1:
        return d.call(this, e);
      case 2:
        return c.call(this, e, k);
      case 3:
        return b.call(this, e, k, l);
      case 4:
        return a.call(this, e, k, l, m);
      default:
        return f.j(e, k, l, m, L(arguments, 4));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  e.D = 4;
  e.s = f.s;
  e.e = d;
  e.a = c;
  e.g = b;
  e.v = a;
  e.j = f.j;
  return e;
}(), ve = function() {
  function a(a, b) {
    return new Sd(null, function() {
      if (0 < a) {
        var f = F(b);
        return f ? N(G(f), c.a(a - 1, I(f))) : null;
      }
      return null;
    }, null, null);
  }
  function b(a) {
    return function(b) {
      return function(a) {
        return function() {
          function c(d, h) {
            var k = Tb(a), l = te.a(a, Hd), k = 0 < k ? b.a ? b.a(d, h) : b.call(null, d, h) : d;
            return 0 < l ? k : new Tc(k);
          }
          function d(a) {
            return b.e ? b.e(a) : b.call(null, a);
          }
          function l() {
            return b.C ? b.C() : b.call(null);
          }
          var m = null, m = function(a, b) {
            switch(arguments.length) {
              case 0:
                return l.call(this);
              case 1:
                return d.call(this, a);
              case 2:
                return c.call(this, a, b);
            }
            throw Error("Invalid arity: " + arguments.length);
          };
          m.C = l;
          m.e = d;
          m.a = c;
          return m;
        }();
      }(qe.e(a));
    };
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), we = function() {
  function a(a, b) {
    return new Sd(null, function(c) {
      return function() {
        return c(a, b);
      };
    }(function(a, b) {
      for (;;) {
        var c = F(b);
        if (0 < a && c) {
          var d = a - 1, c = I(c);
          a = d;
          b = c;
        } else {
          return c;
        }
      }
    }), null, null);
  }
  function b(a) {
    return function(b) {
      return function(a) {
        return function() {
          function c(d, h) {
            var k = Tb(a);
            te.a(a, Hd);
            return 0 < k ? d : b.a ? b.a(d, h) : b.call(null, d, h);
          }
          function d(a) {
            return b.e ? b.e(a) : b.call(null, a);
          }
          function l() {
            return b.C ? b.C() : b.call(null);
          }
          var m = null, m = function(a, b) {
            switch(arguments.length) {
              case 0:
                return l.call(this);
              case 1:
                return d.call(this, a);
              case 2:
                return c.call(this, a, b);
            }
            throw Error("Invalid arity: " + arguments.length);
          };
          m.C = l;
          m.e = d;
          m.a = c;
          return m;
        }();
      }(qe.e(a));
    };
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), xe = function() {
  function a(a, b) {
    return new Sd(null, function() {
      var f = F(b);
      if (f) {
        if (ud(f)) {
          for (var h = rc(f), k = O(h), l = new Ud(Array(k), 0), m = 0;;) {
            if (m < k) {
              var n;
              n = z.a(h, m);
              n = a.e ? a.e(n) : a.call(null, n);
              t(n) && (n = z.a(h, m), l.add(n));
              m += 1;
            } else {
              break;
            }
          }
          return Yd(l.Fa(), c.a(a, sc(f)));
        }
        h = G(f);
        f = I(f);
        return t(a.e ? a.e(h) : a.call(null, h)) ? N(h, c.a(a, f)) : c.a(a, f);
      }
      return null;
    }, null, null);
  }
  function b(a) {
    return function(b) {
      return function() {
        function c(f, h) {
          return t(a.e ? a.e(h) : a.call(null, h)) ? b.a ? b.a(f, h) : b.call(null, f, h) : f;
        }
        function h(a) {
          return b.e ? b.e(a) : b.call(null, a);
        }
        function k() {
          return b.C ? b.C() : b.call(null);
        }
        var l = null, l = function(a, b) {
          switch(arguments.length) {
            case 0:
              return k.call(this);
            case 1:
              return h.call(this, a);
            case 2:
              return c.call(this, a, b);
          }
          throw Error("Invalid arity: " + arguments.length);
        };
        l.C = k;
        l.e = h;
        l.a = c;
        return l;
      }();
    };
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), ye = function() {
  function a(a, b, c) {
    a && (a.F & 4 || a.je) ? (b = Gd.v(b, fe, lc(a), c), b = nc(b), a = cd(b, nd(a))) : a = Gd.v(b, gd, a, c);
    return a;
  }
  function b(a, b) {
    var c;
    null != a ? a && (a.F & 4 || a.je) ? (c = nb.g(mc, lc(a), b), c = nc(c), c = cd(c, nd(a))) : c = nb.g(xb, a, b) : c = nb.g(gd, J, b);
    return c;
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}(), ze = function() {
  function a(a, b, c, k) {
    return new Sd(null, function() {
      var l = F(k);
      if (l) {
        var m = ve.a(a, l);
        return a === O(m) ? N(m, d.v(a, b, c, we.a(b, l))) : xb(J, ve.a(a, de.a(m, c)));
      }
      return null;
    }, null, null);
  }
  function b(a, b, c) {
    return new Sd(null, function() {
      var k = F(c);
      if (k) {
        var l = ve.a(a, k);
        return a === O(l) ? N(l, d.g(a, b, we.a(b, k))) : null;
      }
      return null;
    }, null, null);
  }
  function c(a, b) {
    return d.g(a, a, b);
  }
  var d = null, d = function(d, f, h, k) {
    switch(arguments.length) {
      case 2:
        return c.call(this, d, f);
      case 3:
        return b.call(this, d, f, h);
      case 4:
        return a.call(this, d, f, h, k);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.a = c;
  d.g = b;
  d.v = a;
  return d;
}();
function Ae(a, b) {
  this.T = a;
  this.h = b;
}
function Be(a) {
  return new Ae(a, [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
}
function Ce(a) {
  return new Ae(a.T, lb(a.h));
}
function De(a) {
  a = a.l;
  return 32 > a ? 0 : a - 1 >>> 5 << 5;
}
function Ee(a, b, c) {
  for (;;) {
    if (0 === b) {
      return c;
    }
    var d = Be(a);
    d.h[0] = c;
    c = d;
    b -= 5;
  }
}
var Ge = function Fe(b, c, d, e) {
  var f = Ce(d), h = b.l - 1 >>> c & 31;
  5 === c ? f.h[h] = e : (d = d.h[h], b = null != d ? Fe(b, c - 5, d, e) : Ee(null, c - 5, e), f.h[h] = b);
  return f;
};
function He(a, b) {
  throw Error("No item " + x.e(a) + " in vector of length " + x.e(b));
}
function Ie(a, b) {
  if (b >= De(a)) {
    return a.ra;
  }
  for (var c = a.root, d = a.shift;;) {
    if (0 < d) {
      var e = d - 5, c = c.h[b >>> d & 31], d = e
    } else {
      return c.h;
    }
  }
}
function Je(a, b) {
  return 0 <= b && b < a.l ? Ie(a, b) : He(b, a.l);
}
var Le = function Ke(b, c, d, e, f) {
  var h = Ce(d);
  if (0 === c) {
    h.h[e & 31] = f;
  } else {
    var k = e >>> c & 31;
    b = Ke(b, c - 5, d.h[k], e, f);
    h.h[k] = b;
  }
  return h;
}, Ne = function Me(b, c, d) {
  var e = b.l - 2 >>> c & 31;
  if (5 < c) {
    b = Me(b, c - 5, d.h[e]);
    if (null == b && 0 === e) {
      return null;
    }
    d = Ce(d);
    d.h[e] = b;
    return d;
  }
  if (0 === e) {
    return null;
  }
  d = Ce(d);
  d.h[e] = null;
  return d;
};
function Oe(a, b, c, d, e, f) {
  this.A = a;
  this.Ac = b;
  this.h = c;
  this.Oa = d;
  this.start = e;
  this.end = f;
}
Oe.prototype.Qc = function() {
  return this.A < this.end;
};
Oe.prototype.next = function() {
  32 === this.A - this.Ac && (this.h = Ie(this.Oa, this.A), this.Ac += 32);
  var a = this.h[this.A & 31];
  this.A += 1;
  return a;
};
function U(a, b, c, d, e, f) {
  this.o = a;
  this.l = b;
  this.shift = c;
  this.root = d;
  this.ra = e;
  this.q = f;
  this.p = 167668511;
  this.F = 8196;
}
g = U.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  return "number" === typeof b ? z.g(this, b, c) : c;
};
g.jc = function(a, b, c) {
  a = 0;
  for (var d = c;;) {
    if (a < this.l) {
      var e = Ie(this, a);
      c = e.length;
      a: {
        for (var f = 0;;) {
          if (f < c) {
            var h = f + a, k = e[f], d = b.g ? b.g(d, h, k) : b.call(null, d, h, k);
            if (Uc(d)) {
              e = d;
              break a;
            }
            f += 1;
          } else {
            e = d;
            break a;
          }
        }
        e = void 0;
      }
      if (Uc(e)) {
        return b = e, M.e ? M.e(b) : M.call(null, b);
      }
      a += c;
      d = e;
    } else {
      return d;
    }
  }
};
g.K = function(a, b) {
  return Je(this, b)[b & 31];
};
g.va = function(a, b, c) {
  return 0 <= b && b < this.l ? Ie(this, b)[b & 31] : c;
};
g.Cb = function(a, b, c) {
  if (0 <= b && b < this.l) {
    return De(this) <= b ? (a = lb(this.ra), a[b & 31] = c, new U(this.o, this.l, this.shift, this.root, a, null)) : new U(this.o, this.l, this.shift, Le(this, this.shift, this.root, b, c), this.ra, null);
  }
  if (b === this.l) {
    return xb(this, c);
  }
  throw Error("Index " + x.e(b) + " out of bounds  [0," + x.e(this.l) + "]");
};
g.ic = function() {
  var a = this.l;
  return new Oe(0, 0, 0 < O(this) ? Ie(this, 0) : null, this, 0, a);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new U(this.o, this.l, this.shift, this.root, this.ra, this.q);
};
g.ca = function() {
  return this.l;
};
g.kc = function() {
  return z.a(this, 0);
};
g.lc = function() {
  return z.a(this, 1);
};
g.tb = function() {
  return 0 < this.l ? z.a(this, this.l - 1) : null;
};
g.ub = function() {
  if (0 === this.l) {
    throw Error("Can't pop empty vector");
  }
  if (1 === this.l) {
    return Xb(fd, this.o);
  }
  if (1 < this.l - De(this)) {
    return new U(this.o, this.l - 1, this.shift, this.root, this.ra.slice(0, -1), null);
  }
  var a = Ie(this, this.l - 2), b = Ne(this, this.shift, this.root), b = null == b ? W : b, c = this.l - 1;
  return 5 < this.shift && null == b.h[1] ? new U(this.o, c, this.shift - 5, b.h[0], a, null) : new U(this.o, c, this.shift, b, a, null);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  if (b instanceof U) {
    if (this.l === O(b)) {
      for (var c = wc(this), d = wc(b);;) {
        if (t(c.Qc())) {
          var e = c.next(), f = d.next();
          if (!C.a(e, f)) {
            return!1;
          }
        } else {
          return!0;
        }
      }
    } else {
      return!1;
    }
  } else {
    return $c(this, b);
  }
};
g.Pb = function() {
  var a = this;
  return new Pe(a.l, a.shift, function() {
    var b = a.root;
    return Qe.e ? Qe.e(b) : Qe.call(null, b);
  }(), function() {
    var b = a.ra;
    return Re.e ? Re.e(b) : Re.call(null, b);
  }());
};
g.aa = function() {
  return cd(fd, this.o);
};
g.ha = function(a, b) {
  return Vc.a(this, b);
};
g.ia = function(a, b, c) {
  a = 0;
  for (var d = c;;) {
    if (a < this.l) {
      var e = Ie(this, a);
      c = e.length;
      a: {
        for (var f = 0;;) {
          if (f < c) {
            var h = e[f], d = b.a ? b.a(d, h) : b.call(null, d, h);
            if (Uc(d)) {
              e = d;
              break a;
            }
            f += 1;
          } else {
            e = d;
            break a;
          }
        }
        e = void 0;
      }
      if (Uc(e)) {
        return b = e, M.e ? M.e(b) : M.call(null, b);
      }
      a += c;
      d = e;
    } else {
      return d;
    }
  }
};
g.sb = function(a, b, c) {
  if ("number" === typeof b) {
    return Sb(this, b, c);
  }
  throw Error("Vector's key for assoc must be a number.");
};
g.X = function() {
  if (0 === this.l) {
    return null;
  }
  if (32 >= this.l) {
    return new Nc(this.ra, 0);
  }
  var a;
  a: {
    a = this.root;
    for (var b = this.shift;;) {
      if (0 < b) {
        b -= 5, a = a.h[0];
      } else {
        a = a.h;
        break a;
      }
    }
    a = void 0;
  }
  return Se.v ? Se.v(this, a, 0, 0) : Se.call(null, this, a, 0, 0);
};
g.Y = function(a, b) {
  return new U(b, this.l, this.shift, this.root, this.ra, this.q);
};
g.V = function(a, b) {
  if (32 > this.l - De(this)) {
    for (var c = this.ra.length, d = Array(c + 1), e = 0;;) {
      if (e < c) {
        d[e] = this.ra[e], e += 1;
      } else {
        break;
      }
    }
    d[c] = b;
    return new U(this.o, this.l + 1, this.shift, this.root, d, null);
  }
  c = (d = this.l >>> 5 > 1 << this.shift) ? this.shift + 5 : this.shift;
  d ? (d = Be(null), d.h[0] = this.root, e = Ee(null, this.shift, new Ae(null, this.ra)), d.h[1] = e) : d = Ge(this, this.shift, this.root, new Ae(null, this.ra));
  return new U(this.o, this.l + 1, c, d, [b], null);
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.K(null, c);
      case 3:
        return this.va(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.K(null, c);
  };
  a.g = function(a, c, d) {
    return this.va(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.K(null, a);
};
g.a = function(a, b) {
  return this.va(null, a, b);
};
var W = new Ae(null, [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]), fd = new U(null, 0, 5, W, [], 0);
function Te(a, b) {
  var c = a.length, d = b ? a : lb(a);
  if (32 > c) {
    return new U(null, c, 5, W, d, null);
  }
  for (var e = 32, f = (new U(null, 32, 5, W, d.slice(0, 32), null)).Pb(null);;) {
    if (e < c) {
      var h = e + 1, f = fe.a(f, d[e]), e = h
    } else {
      return nc(f);
    }
  }
}
function Ue(a) {
  return nc(nb.g(mc, lc(fd), a));
}
var Ve = function() {
  function a(a) {
    var d = null;
    0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
    return b.call(this, d);
  }
  function b(a) {
    return a instanceof Nc && 0 === a.A ? Te(a.h, !0) : Ue(a);
  }
  a.D = 0;
  a.s = function(a) {
    a = F(a);
    return b(a);
  };
  a.j = b;
  return a;
}();
function We(a, b, c, d, e, f) {
  this.Ea = a;
  this.nb = b;
  this.A = c;
  this.oa = d;
  this.o = e;
  this.q = f;
  this.p = 32375020;
  this.F = 1536;
}
g = We.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.pa = function() {
  if (this.oa + 1 < this.nb.length) {
    var a;
    a = this.Ea;
    var b = this.nb, c = this.A, d = this.oa + 1;
    a = Se.v ? Se.v(a, b, c, d) : Se.call(null, a, b, c, d);
    return null == a ? null : a;
  }
  return tc(this);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(fd, this.o);
};
g.ha = function(a, b) {
  var c = this;
  return Vc.a(function() {
    var a = c.Ea, b = c.A + c.oa, f = O(c.Ea);
    return Xe.g ? Xe.g(a, b, f) : Xe.call(null, a, b, f);
  }(), b);
};
g.ia = function(a, b, c) {
  var d = this;
  return Vc.g(function() {
    var a = d.Ea, b = d.A + d.oa, c = O(d.Ea);
    return Xe.g ? Xe.g(a, b, c) : Xe.call(null, a, b, c);
  }(), b, c);
};
g.ga = function() {
  return this.nb[this.oa];
};
g.ma = function() {
  if (this.oa + 1 < this.nb.length) {
    var a;
    a = this.Ea;
    var b = this.nb, c = this.A, d = this.oa + 1;
    a = Se.v ? Se.v(a, b, c, d) : Se.call(null, a, b, c, d);
    return null == a ? J : a;
  }
  return sc(this);
};
g.X = function() {
  return this;
};
g.hd = function() {
  return Wd.a(this.nb, this.oa);
};
g.jd = function() {
  var a = this.A + this.nb.length;
  if (a < ub(this.Ea)) {
    var b = this.Ea, c = Ie(this.Ea, a);
    return Se.v ? Se.v(b, c, a, 0) : Se.call(null, b, c, a, 0);
  }
  return J;
};
g.Y = function(a, b) {
  var c = this.Ea, d = this.nb, e = this.A, f = this.oa;
  return Se.Q ? Se.Q(c, d, e, f, b) : Se.call(null, c, d, e, f, b);
};
g.V = function(a, b) {
  return N(b, this);
};
g.gd = function() {
  var a = this.A + this.nb.length;
  if (a < ub(this.Ea)) {
    var b = this.Ea, c = Ie(this.Ea, a);
    return Se.v ? Se.v(b, c, a, 0) : Se.call(null, b, c, a, 0);
  }
  return null;
};
var Se = function() {
  function a(a, b, c, d, l) {
    return new We(a, b, c, d, l, null);
  }
  function b(a, b, c, d) {
    return new We(a, b, c, d, null, null);
  }
  function c(a, b, c) {
    return new We(a, Je(a, b), b, c, null, null);
  }
  var d = null, d = function(d, f, h, k, l) {
    switch(arguments.length) {
      case 3:
        return c.call(this, d, f, h);
      case 4:
        return b.call(this, d, f, h, k);
      case 5:
        return a.call(this, d, f, h, k, l);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.g = c;
  d.v = b;
  d.Q = a;
  return d;
}();
function Ze(a, b, c, d, e) {
  this.o = a;
  this.Oa = b;
  this.start = c;
  this.end = d;
  this.q = e;
  this.p = 166617887;
  this.F = 8192;
}
g = Ze.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  return "number" === typeof b ? z.g(this, b, c) : c;
};
g.K = function(a, b) {
  return 0 > b || this.end <= this.start + b ? He(b, this.end - this.start) : z.a(this.Oa, this.start + b);
};
g.va = function(a, b, c) {
  return 0 > b || this.end <= this.start + b ? c : z.g(this.Oa, this.start + b, c);
};
g.Cb = function(a, b, c) {
  var d = this.start + b;
  a = this.o;
  c = jd.g(this.Oa, d, c);
  b = this.start;
  var e = this.end, d = d + 1, d = e > d ? e : d;
  return $e.Q ? $e.Q(a, c, b, d, null) : $e.call(null, a, c, b, d, null);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new Ze(this.o, this.Oa, this.start, this.end, this.q);
};
g.ca = function() {
  return this.end - this.start;
};
g.tb = function() {
  return z.a(this.Oa, this.end - 1);
};
g.ub = function() {
  if (this.start === this.end) {
    throw Error("Can't pop empty vector");
  }
  var a = this.o, b = this.Oa, c = this.start, d = this.end - 1;
  return $e.Q ? $e.Q(a, b, c, d, null) : $e.call(null, a, b, c, d, null);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(fd, this.o);
};
g.ha = function(a, b) {
  return Vc.a(this, b);
};
g.ia = function(a, b, c) {
  return Vc.g(this, b, c);
};
g.sb = function(a, b, c) {
  if ("number" === typeof b) {
    return Sb(this, b, c);
  }
  throw Error("Subvec's key for assoc must be a number.");
};
g.X = function() {
  var a = this;
  return function(b) {
    return function d(e) {
      return e === a.end ? null : N(z.a(a.Oa, e), new Sd(null, function() {
        return function() {
          return d(e + 1);
        };
      }(b), null, null));
    };
  }(this)(a.start);
};
g.Y = function(a, b) {
  var c = this.Oa, d = this.start, e = this.end, f = this.q;
  return $e.Q ? $e.Q(b, c, d, e, f) : $e.call(null, b, c, d, e, f);
};
g.V = function(a, b) {
  var c = this.o, d = Sb(this.Oa, this.end, b), e = this.start, f = this.end + 1;
  return $e.Q ? $e.Q(c, d, e, f, null) : $e.call(null, c, d, e, f, null);
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.K(null, c);
      case 3:
        return this.va(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.K(null, c);
  };
  a.g = function(a, c, d) {
    return this.va(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.K(null, a);
};
g.a = function(a, b) {
  return this.va(null, a, b);
};
function $e(a, b, c, d, e) {
  for (;;) {
    if (b instanceof Ze) {
      c = b.start + c, d = b.start + d, b = b.Oa;
    } else {
      var f = O(b);
      if (0 > c || 0 > d || c > f || d > f) {
        throw Error("Index out of bounds");
      }
      return new Ze(a, b, c, d, e);
    }
  }
}
var Xe = function() {
  function a(a, b, c) {
    return $e(null, a, b, c, null);
  }
  function b(a, b) {
    return c.g(a, b, O(a));
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}();
function af(a, b) {
  return a === b.T ? b : new Ae(a, lb(b.h));
}
function Qe(a) {
  return new Ae({}, lb(a.h));
}
function Re(a) {
  var b = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
  wd(a, 0, b, 0, a.length);
  return b;
}
var cf = function bf(b, c, d, e) {
  d = af(b.root.T, d);
  var f = b.l - 1 >>> c & 31;
  if (5 === c) {
    b = e;
  } else {
    var h = d.h[f];
    b = null != h ? bf(b, c - 5, h, e) : Ee(b.root.T, c - 5, e);
  }
  d.h[f] = b;
  return d;
};
function Pe(a, b, c, d) {
  this.l = a;
  this.shift = b;
  this.root = c;
  this.ra = d;
  this.p = 275;
  this.F = 88;
}
g = Pe.prototype;
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  return "number" === typeof b ? z.g(this, b, c) : c;
};
g.K = function(a, b) {
  if (this.root.T) {
    return Je(this, b)[b & 31];
  }
  throw Error("nth after persistent!");
};
g.va = function(a, b, c) {
  return 0 <= b && b < this.l ? z.a(this, b) : c;
};
g.ca = function() {
  if (this.root.T) {
    return this.l;
  }
  throw Error("count after persistent!");
};
g.Id = function(a, b, c) {
  var d = this;
  if (d.root.T) {
    if (0 <= b && b < d.l) {
      return De(this) <= b ? d.ra[b & 31] = c : (a = function() {
        return function f(a, k) {
          var l = af(d.root.T, k);
          if (0 === a) {
            l.h[b & 31] = c;
          } else {
            var m = b >>> a & 31, n = f(a - 5, l.h[m]);
            l.h[m] = n;
          }
          return l;
        };
      }(this).call(null, d.shift, d.root), d.root = a), this;
    }
    if (b === d.l) {
      return mc(this, c);
    }
    throw Error("Index " + x.e(b) + " out of bounds for TransientVector of length" + x.e(d.l));
  }
  throw Error("assoc! after persistent!");
};
g.nc = function(a, b, c) {
  if ("number" === typeof b) {
    return pc(this, b, c);
  }
  throw Error("TransientVector's key for assoc! must be a number.");
};
g.Ab = function(a, b) {
  if (this.root.T) {
    if (32 > this.l - De(this)) {
      this.ra[this.l & 31] = b;
    } else {
      var c = new Ae(this.root.T, this.ra), d = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
      d[0] = b;
      this.ra = d;
      if (this.l >>> 5 > 1 << this.shift) {
        var d = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], e = this.shift + 5;
        d[0] = this.root;
        d[1] = Ee(this.root.T, this.shift, c);
        this.root = new Ae(this.root.T, d);
        this.shift = e;
      } else {
        this.root = cf(this, this.shift, this.root, c);
      }
    }
    this.l += 1;
    return this;
  }
  throw Error("conj! after persistent!");
};
g.Bb = function() {
  if (this.root.T) {
    this.root.T = null;
    var a = this.l - De(this), b = Array(a);
    wd(this.ra, 0, b, 0, a);
    return new U(null, this.l, this.shift, this.root, b, null);
  }
  throw Error("persistent! called twice");
};
function df(a, b, c, d) {
  this.o = a;
  this.za = b;
  this.Ta = c;
  this.q = d;
  this.F = 0;
  this.p = 31850572;
}
g = df.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ga = function() {
  return G(this.za);
};
g.ma = function() {
  var a = K(this.za);
  return a ? new df(this.o, a, this.Ta, null) : null == this.Ta ? vb(this) : new df(this.o, this.Ta, null, null);
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new df(b, this.za, this.Ta, this.q);
};
g.V = function(a, b) {
  return N(b, this);
};
function ef(a, b, c, d, e) {
  this.o = a;
  this.count = b;
  this.za = c;
  this.Ta = d;
  this.q = e;
  this.p = 31858766;
  this.F = 8192;
}
g = ef.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new ef(this.o, this.count, this.za, this.Ta, this.q);
};
g.ca = function() {
  return this.count;
};
g.tb = function() {
  return G(this.za);
};
g.ub = function() {
  if (t(this.za)) {
    var a = K(this.za);
    return a ? new ef(this.o, this.count - 1, a, this.Ta, null) : new ef(this.o, this.count - 1, F(this.Ta), fd, null);
  }
  return this;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return ff;
};
g.ga = function() {
  return G(this.za);
};
g.ma = function() {
  return I(F(this));
};
g.X = function() {
  var a = F(this.Ta), b = this.za;
  return t(t(b) ? b : a) ? new df(null, this.za, F(a), null) : null;
};
g.Y = function(a, b) {
  return new ef(b, this.count, this.za, this.Ta, this.q);
};
g.V = function(a, b) {
  var c;
  t(this.za) ? (c = this.Ta, c = new ef(this.o, this.count + 1, this.za, gd.a(t(c) ? c : fd, b), null)) : c = new ef(this.o, this.count + 1, gd.a(this.za, b), fd, null);
  return c;
};
var ff = new ef(null, 0, null, fd, 0);
function gf() {
  this.F = 0;
  this.p = 2097152;
}
gf.prototype.B = function() {
  return!1;
};
gf.prototype.equiv = function(a) {
  return this.B(null, a);
};
var hf = new gf;
function jf(a, b) {
  return Ad(sd(b) ? O(a) === O(b) ? ke(Fd, ue.a(function(a) {
    return C.a(R.g(b, G(a), hf), ed(a));
  }, a)) : null : null);
}
function kf(a) {
  this.I = a;
}
kf.prototype.next = function() {
  if (null != this.I) {
    var a = G(this.I);
    this.I = K(this.I);
    return{done:!1, value:a};
  }
  return{done:!0, value:null};
};
function lf(a) {
  return new kf(F(a));
}
function mf(a) {
  this.I = a;
}
mf.prototype.next = function() {
  if (null != this.I) {
    var a = G(this.I), b = Q.g(a, 0, null), a = Q.g(a, 1, null);
    this.I = K(this.I);
    return{done:!1, value:[b, a]};
  }
  return{done:!0, value:null};
};
function nf(a) {
  return new mf(F(a));
}
function of(a) {
  this.I = a;
}
of.prototype.next = function() {
  if (null != this.I) {
    var a = G(this.I);
    this.I = K(this.I);
    return{done:!1, value:[a, a]};
  }
  return{done:!0, value:null};
};
function pf(a) {
  return new of(F(a));
}
function qf(a, b) {
  var c = a.h;
  if (b instanceof T) {
    a: {
      for (var d = c.length, e = b.Da, f = 0;;) {
        if (d <= f) {
          c = -1;
          break a;
        }
        var h = c[f];
        if (h instanceof T && e === h.Da) {
          c = f;
          break a;
        }
        f += 2;
      }
      c = void 0;
    }
  } else {
    if (d = ga(b), t(t(d) ? d : "number" === typeof b)) {
      a: {
        d = c.length;
        for (e = 0;;) {
          if (d <= e) {
            c = -1;
            break a;
          }
          if (b === c[e]) {
            c = e;
            break a;
          }
          e += 2;
        }
        c = void 0;
      }
    } else {
      if (b instanceof E) {
        a: {
          d = c.length;
          e = b.Ba;
          for (f = 0;;) {
            if (d <= f) {
              c = -1;
              break a;
            }
            h = c[f];
            if (h instanceof E && e === h.Ba) {
              c = f;
              break a;
            }
            f += 2;
          }
          c = void 0;
        }
      } else {
        if (null == b) {
          a: {
            d = c.length;
            for (e = 0;;) {
              if (d <= e) {
                c = -1;
                break a;
              }
              if (null == c[e]) {
                c = e;
                break a;
              }
              e += 2;
            }
            c = void 0;
          }
        } else {
          a: {
            d = c.length;
            for (e = 0;;) {
              if (d <= e) {
                c = -1;
                break a;
              }
              if (C.a(b, c[e])) {
                c = e;
                break a;
              }
              e += 2;
            }
            c = void 0;
          }
        }
      }
    }
  }
  return c;
}
function rf(a, b, c) {
  this.h = a;
  this.A = b;
  this.ua = c;
  this.F = 0;
  this.p = 32374990;
}
g = rf.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.ua;
};
g.pa = function() {
  return this.A < this.h.length - 2 ? new rf(this.h, this.A + 2, this.ua) : null;
};
g.ca = function() {
  return(this.h.length - this.A) / 2;
};
g.J = function() {
  return Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.ua);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return new U(null, 2, 5, W, [this.h[this.A], this.h[this.A + 1]], null);
};
g.ma = function() {
  return this.A < this.h.length - 2 ? new rf(this.h, this.A + 2, this.ua) : J;
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new rf(this.h, this.A, b);
};
g.V = function(a, b) {
  return N(b, this);
};
function sf(a, b, c) {
  this.h = a;
  this.A = b;
  this.l = c;
}
sf.prototype.Qc = function() {
  return this.A < this.l;
};
sf.prototype.next = function() {
  var a = new U(null, 2, 5, W, [this.h[this.A], this.h[this.A + 1]], null);
  this.A += 2;
  return a;
};
function s(a, b, c, d) {
  this.o = a;
  this.l = b;
  this.h = c;
  this.q = d;
  this.p = 16647951;
  this.F = 8196;
}
g = s.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.keys = function() {
  return lf(tf.e ? tf.e(this) : tf.call(null, this));
};
g.entries = function() {
  return nf(F(this));
};
g.values = function() {
  return lf(uf.e ? uf.e(this) : uf.call(null, this));
};
g.has = function(a) {
  return Cd(this, a);
};
g.get = function(a) {
  return this.G(null, a);
};
g.forEach = function(a) {
  for (var b = F(this), c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e), h = Q.g(f, 0, null), f = Q.g(f, 1, null);
      a.a ? a.a(f, h) : a.call(null, f, h);
      e += 1;
    } else {
      if (b = F(b)) {
        ud(b) ? (c = rc(b), b = sc(b), h = c, d = O(c), c = h) : (c = G(b), h = Q.g(c, 0, null), c = f = Q.g(c, 1, null), a.a ? a.a(c, h) : a.call(null, c, h), b = K(b), c = null, d = 0), e = 0;
      } else {
        return null;
      }
    }
  }
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  a = qf(this, b);
  return-1 === a ? c : this.h[a + 1];
};
g.jc = function(a, b, c) {
  a = this.h.length;
  for (var d = 0;;) {
    if (d < a) {
      var e = this.h[d], f = this.h[d + 1];
      c = b.g ? b.g(c, e, f) : b.call(null, c, e, f);
      if (Uc(c)) {
        return b = c, M.e ? M.e(b) : M.call(null, b);
      }
      d += 2;
    } else {
      return c;
    }
  }
};
g.ic = function() {
  return new sf(this.h, 0, 2 * this.l);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new s(this.o, this.l, this.h, this.q);
};
g.ca = function() {
  return this.l;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Qc(this);
};
g.B = function(a, b) {
  if (b && (b.p & 1024 || b.pe)) {
    var c = this.h.length;
    if (this.l === b.ca(null)) {
      for (var d = 0;;) {
        if (d < c) {
          var e = b.H(null, this.h[d], yd);
          if (e !== yd) {
            if (C.a(this.h[d + 1], e)) {
              d += 2;
            } else {
              return!1;
            }
          } else {
            return!1;
          }
        } else {
          return!0;
        }
      }
    } else {
      return!1;
    }
  } else {
    return jf(this, b);
  }
};
g.Pb = function() {
  return new vf({}, this.h.length, lb(this.h));
};
g.aa = function() {
  return Xb(wf, this.o);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.Hc = function(a, b) {
  if (0 <= qf(this, b)) {
    var c = this.h.length, d = c - 2;
    if (0 === d) {
      return vb(this);
    }
    for (var d = Array(d), e = 0, f = 0;;) {
      if (e >= c) {
        return new s(this.o, this.l - 1, d, null);
      }
      C.a(b, this.h[e]) || (d[f] = this.h[e], d[f + 1] = this.h[e + 1], f += 2);
      e += 2;
    }
  } else {
    return this;
  }
};
g.sb = function(a, b, c) {
  a = qf(this, b);
  if (-1 === a) {
    if (this.l < xf) {
      a = this.h;
      for (var d = a.length, e = Array(d + 2), f = 0;;) {
        if (f < d) {
          e[f] = a[f], f += 1;
        } else {
          break;
        }
      }
      e[d] = b;
      e[d + 1] = c;
      return new s(this.o, this.l + 1, e, null);
    }
    return Xb(Hb(ye.a(yf, this), b, c), this.o);
  }
  if (c === this.h[a + 1]) {
    return this;
  }
  b = lb(this.h);
  b[a + 1] = c;
  return new s(this.o, this.l, b, null);
};
g.Dc = function(a, b) {
  return-1 !== qf(this, b);
};
g.X = function() {
  var a = this.h;
  return 0 <= a.length - 2 ? new rf(a, 0, null) : null;
};
g.Y = function(a, b) {
  return new s(b, this.l, this.h, this.q);
};
g.V = function(a, b) {
  if (td(b)) {
    return Hb(this, z.a(b, 0), z.a(b, 1));
  }
  for (var c = this, d = F(b);;) {
    if (null == d) {
      return c;
    }
    var e = G(d);
    if (td(e)) {
      c = Hb(c, z.a(e, 0), z.a(e, 1)), d = K(d);
    } else {
      throw Error("conj on a map takes map entries or seqables of map entries");
    }
  }
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
var wf = new s(null, 0, [], null), xf = 8;
function zf(a, b, c) {
  a = b ? a : lb(a);
  if (c) {
    return new s(null, a.length / 2, a, null);
  }
  c = a.length;
  b = 0;
  for (var d = lc(wf);;) {
    if (b < c) {
      var e = b + 2, d = oc(d, a[b], a[b + 1]);
      b = e;
    } else {
      return nc(d);
    }
  }
}
function vf(a, b, c) {
  this.Qb = a;
  this.Wb = b;
  this.h = c;
  this.F = 56;
  this.p = 258;
}
g = vf.prototype;
g.nc = function(a, b, c) {
  var d = this;
  if (t(d.Qb)) {
    a = qf(this, b);
    if (-1 === a) {
      return d.Wb + 2 <= 2 * xf ? (d.Wb += 2, d.h.push(b), d.h.push(c), this) : ge.g(function() {
        var a = d.Wb, b = d.h;
        return Af.a ? Af.a(a, b) : Af.call(null, a, b);
      }(), b, c);
    }
    c !== d.h[a + 1] && (d.h[a + 1] = c);
    return this;
  }
  throw Error("assoc! after persistent!");
};
g.Ab = function(a, b) {
  if (t(this.Qb)) {
    if (b ? b.p & 2048 || b.qe || (b.p ? 0 : u(Kb, b)) : u(Kb, b)) {
      return oc(this, Bf.e ? Bf.e(b) : Bf.call(null, b), Cf.e ? Cf.e(b) : Cf.call(null, b));
    }
    for (var c = F(b), d = this;;) {
      var e = G(c);
      if (t(e)) {
        var f = e, c = K(c), d = oc(d, function() {
          var a = f;
          return Bf.e ? Bf.e(a) : Bf.call(null, a);
        }(), function() {
          var a = f;
          return Cf.e ? Cf.e(a) : Cf.call(null, a);
        }())
      } else {
        return d;
      }
    }
  } else {
    throw Error("conj! after persistent!");
  }
};
g.Bb = function() {
  if (t(this.Qb)) {
    return this.Qb = !1, new s(null, Id(this.Wb), this.h, null);
  }
  throw Error("persistent! called twice");
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  if (t(this.Qb)) {
    return a = qf(this, b), -1 === a ? c : this.h[a + 1];
  }
  throw Error("lookup after persistent!");
};
g.ca = function() {
  if (t(this.Qb)) {
    return Id(this.Wb);
  }
  throw Error("count after persistent!");
};
function Af(a, b) {
  for (var c = lc(yf), d = 0;;) {
    if (d < a) {
      c = ge.g(c, b[d], b[d + 1]), d += 2;
    } else {
      return c;
    }
  }
}
function Df() {
  this.w = !1;
}
function Ef(a, b) {
  return a === b ? !0 : Pd(a, b) ? !0 : C.a(a, b);
}
var Ff = function() {
  function a(a, b, c, h, k) {
    a = lb(a);
    a[b] = c;
    a[h] = k;
    return a;
  }
  function b(a, b, c) {
    a = lb(a);
    a[b] = c;
    return a;
  }
  var c = null, c = function(c, e, f, h, k) {
    switch(arguments.length) {
      case 3:
        return b.call(this, c, e, f);
      case 5:
        return a.call(this, c, e, f, h, k);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.g = b;
  c.Q = a;
  return c;
}();
function Gf(a, b) {
  var c = Array(a.length - 2);
  wd(a, 0, c, 0, 2 * b);
  wd(a, 2 * (b + 1), c, 2 * b, c.length - 2 * b);
  return c;
}
var Hf = function() {
  function a(a, b, c, h, k, l) {
    a = a.Rb(b);
    a.h[c] = h;
    a.h[k] = l;
    return a;
  }
  function b(a, b, c, h) {
    a = a.Rb(b);
    a.h[c] = h;
    return a;
  }
  var c = null, c = function(c, e, f, h, k, l) {
    switch(arguments.length) {
      case 4:
        return b.call(this, c, e, f, h);
      case 6:
        return a.call(this, c, e, f, h, k, l);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.v = b;
  c.xa = a;
  return c;
}();
function If(a, b, c) {
  for (var d = a.length, e = 0, f = c;;) {
    if (e < d) {
      c = a[e];
      if (null != c) {
        var h = a[e + 1];
        c = b.g ? b.g(f, c, h) : b.call(null, f, c, h);
      } else {
        c = a[e + 1], c = null != c ? c.Hb(b, f) : f;
      }
      if (Uc(c)) {
        return a = c, M.e ? M.e(a) : M.call(null, a);
      }
      e += 2;
      f = c;
    } else {
      return f;
    }
  }
}
function Jf(a, b, c) {
  this.T = a;
  this.ba = b;
  this.h = c;
}
g = Jf.prototype;
g.Rb = function(a) {
  if (a === this.T) {
    return this;
  }
  var b = Jd(this.ba), c = Array(0 > b ? 4 : 2 * (b + 1));
  wd(this.h, 0, c, 0, 2 * b);
  return new Jf(a, this.ba, c);
};
g.sc = function() {
  var a = this.h;
  return Kf.e ? Kf.e(a) : Kf.call(null, a);
};
g.Hb = function(a, b) {
  return If(this.h, a, b);
};
g.wb = function(a, b, c, d) {
  var e = 1 << (b >>> a & 31);
  if (0 === (this.ba & e)) {
    return d;
  }
  var f = Jd(this.ba & e - 1), e = this.h[2 * f], f = this.h[2 * f + 1];
  return null == e ? f.wb(a + 5, b, c, d) : Ef(c, e) ? f : d;
};
g.Ra = function(a, b, c, d, e, f) {
  var h = 1 << (c >>> b & 31), k = Jd(this.ba & h - 1);
  if (0 === (this.ba & h)) {
    var l = Jd(this.ba);
    if (2 * l < this.h.length) {
      var m = this.Rb(a), n = m.h;
      f.w = !0;
      xd(n, 2 * k, n, 2 * (k + 1), 2 * (l - k));
      n[2 * k] = d;
      n[2 * k + 1] = e;
      m.ba |= h;
      return m;
    }
    if (16 <= l) {
      h = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
      h[c >>> b & 31] = Lf.Ra(a, b + 5, c, d, e, f);
      for (m = k = 0;;) {
        if (32 > k) {
          0 !== (this.ba >>> k & 1) && (h[k] = null != this.h[m] ? Lf.Ra(a, b + 5, Ic(this.h[m]), this.h[m], this.h[m + 1], f) : this.h[m + 1], m += 2), k += 1;
        } else {
          break;
        }
      }
      return new Mf(a, l + 1, h);
    }
    n = Array(2 * (l + 4));
    wd(this.h, 0, n, 0, 2 * k);
    n[2 * k] = d;
    n[2 * k + 1] = e;
    wd(this.h, 2 * k, n, 2 * (k + 1), 2 * (l - k));
    f.w = !0;
    m = this.Rb(a);
    m.h = n;
    m.ba |= h;
    return m;
  }
  var p = this.h[2 * k], r = this.h[2 * k + 1];
  if (null == p) {
    return l = r.Ra(a, b + 5, c, d, e, f), l === r ? this : Hf.v(this, a, 2 * k + 1, l);
  }
  if (Ef(d, p)) {
    return e === r ? this : Hf.v(this, a, 2 * k + 1, e);
  }
  f.w = !0;
  return Hf.xa(this, a, 2 * k, null, 2 * k + 1, function() {
    var f = b + 5;
    return Nf.Ga ? Nf.Ga(a, f, p, r, c, d, e) : Nf.call(null, a, f, p, r, c, d, e);
  }());
};
g.Qa = function(a, b, c, d, e) {
  var f = 1 << (b >>> a & 31), h = Jd(this.ba & f - 1);
  if (0 === (this.ba & f)) {
    var k = Jd(this.ba);
    if (16 <= k) {
      f = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
      f[b >>> a & 31] = Lf.Qa(a + 5, b, c, d, e);
      for (var l = h = 0;;) {
        if (32 > h) {
          0 !== (this.ba >>> h & 1) && (f[h] = null != this.h[l] ? Lf.Qa(a + 5, Ic(this.h[l]), this.h[l], this.h[l + 1], e) : this.h[l + 1], l += 2), h += 1;
        } else {
          break;
        }
      }
      return new Mf(null, k + 1, f);
    }
    l = Array(2 * (k + 1));
    wd(this.h, 0, l, 0, 2 * h);
    l[2 * h] = c;
    l[2 * h + 1] = d;
    wd(this.h, 2 * h, l, 2 * (h + 1), 2 * (k - h));
    e.w = !0;
    return new Jf(null, this.ba | f, l);
  }
  var m = this.h[2 * h], n = this.h[2 * h + 1];
  if (null == m) {
    return k = n.Qa(a + 5, b, c, d, e), k === n ? this : new Jf(null, this.ba, Ff.g(this.h, 2 * h + 1, k));
  }
  if (Ef(c, m)) {
    return d === n ? this : new Jf(null, this.ba, Ff.g(this.h, 2 * h + 1, d));
  }
  e.w = !0;
  return new Jf(null, this.ba, Ff.Q(this.h, 2 * h, null, 2 * h + 1, function() {
    var e = a + 5;
    return Nf.xa ? Nf.xa(e, m, n, b, c, d) : Nf.call(null, e, m, n, b, c, d);
  }()));
};
g.tc = function(a, b, c) {
  var d = 1 << (b >>> a & 31);
  if (0 === (this.ba & d)) {
    return this;
  }
  var e = Jd(this.ba & d - 1), f = this.h[2 * e], h = this.h[2 * e + 1];
  return null == f ? (a = h.tc(a + 5, b, c), a === h ? this : null != a ? new Jf(null, this.ba, Ff.g(this.h, 2 * e + 1, a)) : this.ba === d ? null : new Jf(null, this.ba ^ d, Gf(this.h, e))) : Ef(c, f) ? new Jf(null, this.ba ^ d, Gf(this.h, e)) : this;
};
var Lf = new Jf(null, 0, []);
function Mf(a, b, c) {
  this.T = a;
  this.l = b;
  this.h = c;
}
g = Mf.prototype;
g.Rb = function(a) {
  return a === this.T ? this : new Mf(a, this.l, lb(this.h));
};
g.sc = function() {
  var a = this.h;
  return Of.e ? Of.e(a) : Of.call(null, a);
};
g.Hb = function(a, b) {
  for (var c = this.h.length, d = 0, e = b;;) {
    if (d < c) {
      var f = this.h[d];
      if (null != f && (e = f.Hb(a, e), Uc(e))) {
        return c = e, M.e ? M.e(c) : M.call(null, c);
      }
      d += 1;
    } else {
      return e;
    }
  }
};
g.wb = function(a, b, c, d) {
  var e = this.h[b >>> a & 31];
  return null != e ? e.wb(a + 5, b, c, d) : d;
};
g.Ra = function(a, b, c, d, e, f) {
  var h = c >>> b & 31, k = this.h[h];
  if (null == k) {
    return a = Hf.v(this, a, h, Lf.Ra(a, b + 5, c, d, e, f)), a.l += 1, a;
  }
  b = k.Ra(a, b + 5, c, d, e, f);
  return b === k ? this : Hf.v(this, a, h, b);
};
g.Qa = function(a, b, c, d, e) {
  var f = b >>> a & 31, h = this.h[f];
  if (null == h) {
    return new Mf(null, this.l + 1, Ff.g(this.h, f, Lf.Qa(a + 5, b, c, d, e)));
  }
  a = h.Qa(a + 5, b, c, d, e);
  return a === h ? this : new Mf(null, this.l, Ff.g(this.h, f, a));
};
g.tc = function(a, b, c) {
  var d = b >>> a & 31, e = this.h[d];
  if (null != e) {
    a = e.tc(a + 5, b, c);
    if (a === e) {
      d = this;
    } else {
      if (null == a) {
        if (8 >= this.l) {
          a: {
            e = this.h;
            a = e.length;
            b = Array(2 * (this.l - 1));
            c = 0;
            for (var f = 1, h = 0;;) {
              if (c < a) {
                c !== d && null != e[c] && (b[f] = e[c], f += 2, h |= 1 << c), c += 1;
              } else {
                d = new Jf(null, h, b);
                break a;
              }
            }
            d = void 0;
          }
        } else {
          d = new Mf(null, this.l - 1, Ff.g(this.h, d, a));
        }
      } else {
        d = new Mf(null, this.l, Ff.g(this.h, d, a));
      }
    }
    return d;
  }
  return this;
};
function Pf(a, b, c) {
  b *= 2;
  for (var d = 0;;) {
    if (d < b) {
      if (Ef(c, a[d])) {
        return d;
      }
      d += 2;
    } else {
      return-1;
    }
  }
}
function Qf(a, b, c, d) {
  this.T = a;
  this.lb = b;
  this.l = c;
  this.h = d;
}
g = Qf.prototype;
g.Rb = function(a) {
  if (a === this.T) {
    return this;
  }
  var b = Array(2 * (this.l + 1));
  wd(this.h, 0, b, 0, 2 * this.l);
  return new Qf(a, this.lb, this.l, b);
};
g.sc = function() {
  var a = this.h;
  return Kf.e ? Kf.e(a) : Kf.call(null, a);
};
g.Hb = function(a, b) {
  return If(this.h, a, b);
};
g.wb = function(a, b, c, d) {
  a = Pf(this.h, this.l, c);
  return 0 > a ? d : Ef(c, this.h[a]) ? this.h[a + 1] : d;
};
g.Ra = function(a, b, c, d, e, f) {
  if (c === this.lb) {
    b = Pf(this.h, this.l, d);
    if (-1 === b) {
      if (this.h.length > 2 * this.l) {
        return a = Hf.xa(this, a, 2 * this.l, d, 2 * this.l + 1, e), f.w = !0, a.l += 1, a;
      }
      c = this.h.length;
      b = Array(c + 2);
      wd(this.h, 0, b, 0, c);
      b[c] = d;
      b[c + 1] = e;
      f.w = !0;
      f = this.l + 1;
      a === this.T ? (this.h = b, this.l = f, a = this) : a = new Qf(this.T, this.lb, f, b);
      return a;
    }
    return this.h[b + 1] === e ? this : Hf.v(this, a, b + 1, e);
  }
  return(new Jf(a, 1 << (this.lb >>> b & 31), [null, this, null, null])).Ra(a, b, c, d, e, f);
};
g.Qa = function(a, b, c, d, e) {
  return b === this.lb ? (a = Pf(this.h, this.l, c), -1 === a ? (a = 2 * this.l, b = Array(a + 2), wd(this.h, 0, b, 0, a), b[a] = c, b[a + 1] = d, e.w = !0, new Qf(null, this.lb, this.l + 1, b)) : C.a(this.h[a], d) ? this : new Qf(null, this.lb, this.l, Ff.g(this.h, a + 1, d))) : (new Jf(null, 1 << (this.lb >>> a & 31), [null, this])).Qa(a, b, c, d, e);
};
g.tc = function(a, b, c) {
  a = Pf(this.h, this.l, c);
  return-1 === a ? this : 1 === this.l ? null : new Qf(null, this.lb, this.l - 1, Gf(this.h, Id(a)));
};
var Nf = function() {
  function a(a, b, c, h, k, l, m) {
    var n = Ic(c);
    if (n === k) {
      return new Qf(null, n, 2, [c, h, l, m]);
    }
    var p = new Df;
    return Lf.Ra(a, b, n, c, h, p).Ra(a, b, k, l, m, p);
  }
  function b(a, b, c, h, k, l) {
    var m = Ic(b);
    if (m === h) {
      return new Qf(null, m, 2, [b, c, k, l]);
    }
    var n = new Df;
    return Lf.Qa(a, m, b, c, n).Qa(a, h, k, l, n);
  }
  var c = null, c = function(c, e, f, h, k, l, m) {
    switch(arguments.length) {
      case 6:
        return b.call(this, c, e, f, h, k, l);
      case 7:
        return a.call(this, c, e, f, h, k, l, m);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.xa = b;
  c.Ga = a;
  return c;
}();
function Rf(a, b, c, d, e) {
  this.o = a;
  this.xb = b;
  this.A = c;
  this.I = d;
  this.q = e;
  this.F = 0;
  this.p = 32374860;
}
g = Rf.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return null == this.I ? new U(null, 2, 5, W, [this.xb[this.A], this.xb[this.A + 1]], null) : G(this.I);
};
g.ma = function() {
  if (null == this.I) {
    var a = this.xb, b = this.A + 2;
    return Kf.g ? Kf.g(a, b, null) : Kf.call(null, a, b, null);
  }
  var a = this.xb, b = this.A, c = K(this.I);
  return Kf.g ? Kf.g(a, b, c) : Kf.call(null, a, b, c);
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new Rf(b, this.xb, this.A, this.I, this.q);
};
g.V = function(a, b) {
  return N(b, this);
};
var Kf = function() {
  function a(a, b, c) {
    if (null == c) {
      for (c = a.length;;) {
        if (b < c) {
          if (null != a[b]) {
            return new Rf(null, a, b, null, null);
          }
          var h = a[b + 1];
          if (t(h) && (h = h.sc(), t(h))) {
            return new Rf(null, a, b + 2, h, null);
          }
          b += 2;
        } else {
          return null;
        }
      }
    } else {
      return new Rf(null, a, b, c, null);
    }
  }
  function b(a) {
    return c.g(a, 0, null);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.g = a;
  return c;
}();
function Sf(a, b, c, d, e) {
  this.o = a;
  this.xb = b;
  this.A = c;
  this.I = d;
  this.q = e;
  this.F = 0;
  this.p = 32374860;
}
g = Sf.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return G(this.I);
};
g.ma = function() {
  var a = this.xb, b = this.A, c = K(this.I);
  return Of.v ? Of.v(null, a, b, c) : Of.call(null, null, a, b, c);
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new Sf(b, this.xb, this.A, this.I, this.q);
};
g.V = function(a, b) {
  return N(b, this);
};
var Of = function() {
  function a(a, b, c, h) {
    if (null == h) {
      for (h = b.length;;) {
        if (c < h) {
          var k = b[c];
          if (t(k) && (k = k.sc(), t(k))) {
            return new Sf(a, b, c + 1, k, null);
          }
          c += 1;
        } else {
          return null;
        }
      }
    } else {
      return new Sf(a, b, c, h, null);
    }
  }
  function b(a) {
    return c.v(null, a, 0, null);
  }
  var c = null, c = function(c, e, f, h) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 4:
        return a.call(this, c, e, f, h);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.v = a;
  return c;
}();
function Tf(a, b, c, d, e, f) {
  this.o = a;
  this.l = b;
  this.root = c;
  this.qa = d;
  this.Aa = e;
  this.q = f;
  this.p = 16123663;
  this.F = 8196;
}
g = Tf.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.keys = function() {
  return lf(tf.e ? tf.e(this) : tf.call(null, this));
};
g.entries = function() {
  return nf(F(this));
};
g.values = function() {
  return lf(uf.e ? uf.e(this) : uf.call(null, this));
};
g.has = function(a) {
  return Cd(this, a);
};
g.get = function(a) {
  return this.G(null, a);
};
g.forEach = function(a) {
  for (var b = F(this), c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e), h = Q.g(f, 0, null), f = Q.g(f, 1, null);
      a.a ? a.a(f, h) : a.call(null, f, h);
      e += 1;
    } else {
      if (b = F(b)) {
        ud(b) ? (c = rc(b), b = sc(b), h = c, d = O(c), c = h) : (c = G(b), h = Q.g(c, 0, null), c = f = Q.g(c, 1, null), a.a ? a.a(c, h) : a.call(null, c, h), b = K(b), c = null, d = 0), e = 0;
      } else {
        return null;
      }
    }
  }
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  return null == b ? this.qa ? this.Aa : c : null == this.root ? c : this.root.wb(0, Ic(b), b, c);
};
g.jc = function(a, b, c) {
  this.qa && (a = this.Aa, c = b.g ? b.g(c, null, a) : b.call(null, c, null, a));
  return Uc(c) ? M.e ? M.e(c) : M.call(null, c) : null != this.root ? this.root.Hb(b, c) : c;
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new Tf(this.o, this.l, this.root, this.qa, this.Aa, this.q);
};
g.ca = function() {
  return this.l;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Qc(this);
};
g.B = function(a, b) {
  return jf(this, b);
};
g.Pb = function() {
  return new Uf({}, this.root, this.l, this.qa, this.Aa);
};
g.aa = function() {
  return Xb(yf, this.o);
};
g.Hc = function(a, b) {
  if (null == b) {
    return this.qa ? new Tf(this.o, this.l - 1, this.root, !1, null, null) : this;
  }
  if (null == this.root) {
    return this;
  }
  var c = this.root.tc(0, Ic(b), b);
  return c === this.root ? this : new Tf(this.o, this.l - 1, c, this.qa, this.Aa, null);
};
g.sb = function(a, b, c) {
  if (null == b) {
    return this.qa && c === this.Aa ? this : new Tf(this.o, this.qa ? this.l : this.l + 1, this.root, !0, c, null);
  }
  a = new Df;
  b = (null == this.root ? Lf : this.root).Qa(0, Ic(b), b, c, a);
  return b === this.root ? this : new Tf(this.o, a.w ? this.l + 1 : this.l, b, this.qa, this.Aa, null);
};
g.Dc = function(a, b) {
  return null == b ? this.qa : null == this.root ? !1 : this.root.wb(0, Ic(b), b, yd) !== yd;
};
g.X = function() {
  if (0 < this.l) {
    var a = null != this.root ? this.root.sc() : null;
    return this.qa ? N(new U(null, 2, 5, W, [null, this.Aa], null), a) : a;
  }
  return null;
};
g.Y = function(a, b) {
  return new Tf(b, this.l, this.root, this.qa, this.Aa, this.q);
};
g.V = function(a, b) {
  if (td(b)) {
    return Hb(this, z.a(b, 0), z.a(b, 1));
  }
  for (var c = this, d = F(b);;) {
    if (null == d) {
      return c;
    }
    var e = G(d);
    if (td(e)) {
      c = Hb(c, z.a(e, 0), z.a(e, 1)), d = K(d);
    } else {
      throw Error("conj on a map takes map entries or seqables of map entries");
    }
  }
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
var yf = new Tf(null, 0, null, !1, null, 0);
function id(a, b) {
  for (var c = a.length, d = 0, e = lc(yf);;) {
    if (d < c) {
      var f = d + 1, e = e.nc(null, a[d], b[d]), d = f
    } else {
      return nc(e);
    }
  }
}
function Uf(a, b, c, d, e) {
  this.T = a;
  this.root = b;
  this.count = c;
  this.qa = d;
  this.Aa = e;
  this.F = 56;
  this.p = 258;
}
g = Uf.prototype;
g.nc = function(a, b, c) {
  return Vf(this, b, c);
};
g.Ab = function(a, b) {
  return Wf(this, b);
};
g.Bb = function() {
  var a;
  if (this.T) {
    this.T = null, a = new Tf(null, this.count, this.root, this.qa, this.Aa, null);
  } else {
    throw Error("persistent! called twice");
  }
  return a;
};
g.G = function(a, b) {
  return null == b ? this.qa ? this.Aa : null : null == this.root ? null : this.root.wb(0, Ic(b), b);
};
g.H = function(a, b, c) {
  return null == b ? this.qa ? this.Aa : c : null == this.root ? c : this.root.wb(0, Ic(b), b, c);
};
g.ca = function() {
  if (this.T) {
    return this.count;
  }
  throw Error("count after persistent!");
};
function Wf(a, b) {
  if (a.T) {
    if (b ? b.p & 2048 || b.qe || (b.p ? 0 : u(Kb, b)) : u(Kb, b)) {
      return Vf(a, Bf.e ? Bf.e(b) : Bf.call(null, b), Cf.e ? Cf.e(b) : Cf.call(null, b));
    }
    for (var c = F(b), d = a;;) {
      var e = G(c);
      if (t(e)) {
        var f = e, c = K(c), d = Vf(d, function() {
          var a = f;
          return Bf.e ? Bf.e(a) : Bf.call(null, a);
        }(), function() {
          var a = f;
          return Cf.e ? Cf.e(a) : Cf.call(null, a);
        }())
      } else {
        return d;
      }
    }
  } else {
    throw Error("conj! after persistent");
  }
}
function Vf(a, b, c) {
  if (a.T) {
    if (null == b) {
      a.Aa !== c && (a.Aa = c), a.qa || (a.count += 1, a.qa = !0);
    } else {
      var d = new Df;
      b = (null == a.root ? Lf : a.root).Ra(a.T, 0, Ic(b), b, c, d);
      b !== a.root && (a.root = b);
      d.w && (a.count += 1);
    }
    return a;
  }
  throw Error("assoc! after persistent!");
}
function Xf(a, b, c) {
  for (var d = b;;) {
    if (null != a) {
      b = c ? a.left : a.right, d = gd.a(d, a), a = b;
    } else {
      return d;
    }
  }
}
function Yf(a, b, c, d, e) {
  this.o = a;
  this.stack = b;
  this.yc = c;
  this.l = d;
  this.q = e;
  this.F = 0;
  this.p = 32374862;
}
g = Yf.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.o;
};
g.ca = function() {
  return 0 > this.l ? O(K(this)) + 1 : this.l;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  var a = this.stack;
  return null == a ? null : Ob(a);
};
g.ma = function() {
  var a = G(this.stack), a = Xf(this.yc ? a.right : a.left, K(this.stack), this.yc);
  return null != a ? new Yf(null, a, this.yc, this.l - 1, null) : J;
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new Yf(b, this.stack, this.yc, this.l, this.q);
};
g.V = function(a, b) {
  return N(b, this);
};
function Zf(a, b, c, d) {
  return c instanceof X ? c.left instanceof X ? new X(c.key, c.w, c.left.Xa(), new Y(a, b, c.right, d, null), null) : c.right instanceof X ? new X(c.right.key, c.right.w, new Y(c.key, c.w, c.left, c.right.left, null), new Y(a, b, c.right.right, d, null), null) : new Y(a, b, c, d, null) : new Y(a, b, c, d, null);
}
function $f(a, b, c, d) {
  return d instanceof X ? d.right instanceof X ? new X(d.key, d.w, new Y(a, b, c, d.left, null), d.right.Xa(), null) : d.left instanceof X ? new X(d.left.key, d.left.w, new Y(a, b, c, d.left.left, null), new Y(d.key, d.w, d.left.right, d.right, null), null) : new Y(a, b, c, d, null) : new Y(a, b, c, d, null);
}
function ag(a, b, c, d) {
  if (c instanceof X) {
    return new X(a, b, c.Xa(), d, null);
  }
  if (d instanceof Y) {
    return $f(a, b, c, d.wc());
  }
  if (d instanceof X && d.left instanceof Y) {
    return new X(d.left.key, d.left.w, new Y(a, b, c, d.left.left, null), $f(d.key, d.w, d.left.right, d.right.wc()), null);
  }
  throw Error("red-black tree invariant violation");
}
var cg = function bg(b, c, d) {
  d = null != b.left ? bg(b.left, c, d) : d;
  if (Uc(d)) {
    return M.e ? M.e(d) : M.call(null, d);
  }
  var e = b.key, f = b.w;
  d = c.g ? c.g(d, e, f) : c.call(null, d, e, f);
  if (Uc(d)) {
    return M.e ? M.e(d) : M.call(null, d);
  }
  b = null != b.right ? bg(b.right, c, d) : d;
  return Uc(b) ? M.e ? M.e(b) : M.call(null, b) : b;
};
function Y(a, b, c, d, e) {
  this.key = a;
  this.w = b;
  this.left = c;
  this.right = d;
  this.q = e;
  this.F = 0;
  this.p = 32402207;
}
g = Y.prototype;
g.Cd = function(a) {
  return a.Ed(this);
};
g.wc = function() {
  return new X(this.key, this.w, this.left, this.right, null);
};
g.Xa = function() {
  return this;
};
g.Bd = function(a) {
  return a.Dd(this);
};
g.replace = function(a, b, c, d) {
  return new Y(a, b, c, d, null);
};
g.Dd = function(a) {
  return new Y(a.key, a.w, this, a.right, null);
};
g.Ed = function(a) {
  return new Y(a.key, a.w, a.left, this, null);
};
g.Hb = function(a, b) {
  return cg(this, a, b);
};
g.G = function(a, b) {
  return z.g(this, b, null);
};
g.H = function(a, b, c) {
  return z.g(this, b, c);
};
g.K = function(a, b) {
  return 0 === b ? this.key : 1 === b ? this.w : null;
};
g.va = function(a, b, c) {
  return 0 === b ? this.key : 1 === b ? this.w : c;
};
g.Cb = function(a, b, c) {
  return(new U(null, 2, 5, W, [this.key, this.w], null)).Cb(null, b, c);
};
g.R = function() {
  return null;
};
g.ca = function() {
  return 2;
};
g.kc = function() {
  return this.key;
};
g.lc = function() {
  return this.w;
};
g.tb = function() {
  return this.w;
};
g.ub = function() {
  return new U(null, 1, 5, W, [this.key], null);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return fd;
};
g.ha = function(a, b) {
  return Vc.a(this, b);
};
g.ia = function(a, b, c) {
  return Vc.g(this, b, c);
};
g.sb = function(a, b, c) {
  return jd.g(new U(null, 2, 5, W, [this.key, this.w], null), b, c);
};
g.X = function() {
  return xb(xb(J, this.w), this.key);
};
g.Y = function(a, b) {
  return cd(new U(null, 2, 5, W, [this.key, this.w], null), b);
};
g.V = function(a, b) {
  return new U(null, 3, 5, W, [this.key, this.w, b], null);
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
function X(a, b, c, d, e) {
  this.key = a;
  this.w = b;
  this.left = c;
  this.right = d;
  this.q = e;
  this.F = 0;
  this.p = 32402207;
}
g = X.prototype;
g.Cd = function(a) {
  return new X(this.key, this.w, this.left, a, null);
};
g.wc = function() {
  throw Error("red-black tree invariant violation");
};
g.Xa = function() {
  return new Y(this.key, this.w, this.left, this.right, null);
};
g.Bd = function(a) {
  return new X(this.key, this.w, a, this.right, null);
};
g.replace = function(a, b, c, d) {
  return new X(a, b, c, d, null);
};
g.Dd = function(a) {
  return this.left instanceof X ? new X(this.key, this.w, this.left.Xa(), new Y(a.key, a.w, this.right, a.right, null), null) : this.right instanceof X ? new X(this.right.key, this.right.w, new Y(this.key, this.w, this.left, this.right.left, null), new Y(a.key, a.w, this.right.right, a.right, null), null) : new Y(a.key, a.w, this, a.right, null);
};
g.Ed = function(a) {
  return this.right instanceof X ? new X(this.key, this.w, new Y(a.key, a.w, a.left, this.left, null), this.right.Xa(), null) : this.left instanceof X ? new X(this.left.key, this.left.w, new Y(a.key, a.w, a.left, this.left.left, null), new Y(this.key, this.w, this.left.right, this.right, null), null) : new Y(a.key, a.w, a.left, this, null);
};
g.Hb = function(a, b) {
  return cg(this, a, b);
};
g.G = function(a, b) {
  return z.g(this, b, null);
};
g.H = function(a, b, c) {
  return z.g(this, b, c);
};
g.K = function(a, b) {
  return 0 === b ? this.key : 1 === b ? this.w : null;
};
g.va = function(a, b, c) {
  return 0 === b ? this.key : 1 === b ? this.w : c;
};
g.Cb = function(a, b, c) {
  return(new U(null, 2, 5, W, [this.key, this.w], null)).Cb(null, b, c);
};
g.R = function() {
  return null;
};
g.ca = function() {
  return 2;
};
g.kc = function() {
  return this.key;
};
g.lc = function() {
  return this.w;
};
g.tb = function() {
  return this.w;
};
g.ub = function() {
  return new U(null, 1, 5, W, [this.key], null);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return fd;
};
g.ha = function(a, b) {
  return Vc.a(this, b);
};
g.ia = function(a, b, c) {
  return Vc.g(this, b, c);
};
g.sb = function(a, b, c) {
  return jd.g(new U(null, 2, 5, W, [this.key, this.w], null), b, c);
};
g.X = function() {
  return xb(xb(J, this.w), this.key);
};
g.Y = function(a, b) {
  return cd(new U(null, 2, 5, W, [this.key, this.w], null), b);
};
g.V = function(a, b) {
  return new U(null, 3, 5, W, [this.key, this.w, b], null);
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
var eg = function dg(b, c, d, e, f) {
  if (null == c) {
    return new X(d, e, null, null, null);
  }
  var h;
  h = c.key;
  h = b.a ? b.a(d, h) : b.call(null, d, h);
  if (0 === h) {
    return f[0] = c, null;
  }
  if (0 > h) {
    return b = dg(b, c.left, d, e, f), null != b ? c.Bd(b) : null;
  }
  b = dg(b, c.right, d, e, f);
  return null != b ? c.Cd(b) : null;
}, gg = function fg(b, c) {
  if (null == b) {
    return c;
  }
  if (null == c) {
    return b;
  }
  if (b instanceof X) {
    if (c instanceof X) {
      var d = fg(b.right, c.left);
      return d instanceof X ? new X(d.key, d.w, new X(b.key, b.w, b.left, d.left, null), new X(c.key, c.w, d.right, c.right, null), null) : new X(b.key, b.w, b.left, new X(c.key, c.w, d, c.right, null), null);
    }
    return new X(b.key, b.w, b.left, fg(b.right, c), null);
  }
  if (c instanceof X) {
    return new X(c.key, c.w, fg(b, c.left), c.right, null);
  }
  d = fg(b.right, c.left);
  return d instanceof X ? new X(d.key, d.w, new Y(b.key, b.w, b.left, d.left, null), new Y(c.key, c.w, d.right, c.right, null), null) : ag(b.key, b.w, b.left, new Y(c.key, c.w, d, c.right, null));
}, ig = function hg(b, c, d, e) {
  if (null != c) {
    var f;
    f = c.key;
    f = b.a ? b.a(d, f) : b.call(null, d, f);
    if (0 === f) {
      return e[0] = c, gg(c.left, c.right);
    }
    if (0 > f) {
      return b = hg(b, c.left, d, e), null != b || null != e[0] ? c.left instanceof Y ? ag(c.key, c.w, b, c.right) : new X(c.key, c.w, b, c.right, null) : null;
    }
    b = hg(b, c.right, d, e);
    if (null != b || null != e[0]) {
      if (c.right instanceof Y) {
        if (e = c.key, d = c.w, c = c.left, b instanceof X) {
          c = new X(e, d, c, b.Xa(), null);
        } else {
          if (c instanceof Y) {
            c = Zf(e, d, c.wc(), b);
          } else {
            if (c instanceof X && c.right instanceof Y) {
              c = new X(c.right.key, c.right.w, Zf(c.key, c.w, c.left.wc(), c.right.left), new Y(e, d, c.right.right, b, null), null);
            } else {
              throw Error("red-black tree invariant violation");
            }
          }
        }
      } else {
        c = new X(c.key, c.w, c.left, b, null);
      }
    } else {
      c = null;
    }
    return c;
  }
  return null;
}, kg = function jg(b, c, d, e) {
  var f = c.key, h = b.a ? b.a(d, f) : b.call(null, d, f);
  return 0 === h ? c.replace(f, e, c.left, c.right) : 0 > h ? c.replace(f, c.w, jg(b, c.left, d, e), c.right) : c.replace(f, c.w, c.left, jg(b, c.right, d, e));
};
function lg(a, b, c, d, e) {
  this.Ia = a;
  this.pb = b;
  this.l = c;
  this.o = d;
  this.q = e;
  this.p = 418776847;
  this.F = 8192;
}
g = lg.prototype;
g.forEach = function(a) {
  for (var b = F(this), c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e), h = Q.g(f, 0, null), f = Q.g(f, 1, null);
      a.a ? a.a(f, h) : a.call(null, f, h);
      e += 1;
    } else {
      if (b = F(b)) {
        ud(b) ? (c = rc(b), b = sc(b), h = c, d = O(c), c = h) : (c = G(b), h = Q.g(c, 0, null), c = f = Q.g(c, 1, null), a.a ? a.a(c, h) : a.call(null, c, h), b = K(b), c = null, d = 0), e = 0;
      } else {
        return null;
      }
    }
  }
};
g.get = function(a) {
  return this.G(null, a);
};
g.entries = function() {
  return nf(F(this));
};
g.toString = function() {
  return yc(this);
};
g.keys = function() {
  return lf(tf.e ? tf.e(this) : tf.call(null, this));
};
g.values = function() {
  return lf(uf.e ? uf.e(this) : uf.call(null, this));
};
g.equiv = function(a) {
  return this.B(null, a);
};
function mg(a, b) {
  for (var c = a.pb;;) {
    if (null != c) {
      var d;
      d = c.key;
      d = a.Ia.a ? a.Ia.a(b, d) : a.Ia.call(null, b, d);
      if (0 === d) {
        return c;
      }
      c = 0 > d ? c.left : c.right;
    } else {
      return null;
    }
  }
}
g.has = function(a) {
  return Cd(this, a);
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  a = mg(this, b);
  return null != a ? a.w : c;
};
g.jc = function(a, b, c) {
  return null != this.pb ? cg(this.pb, b, c) : c;
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new lg(this.Ia, this.pb, this.l, this.o, this.q);
};
g.ca = function() {
  return this.l;
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Qc(this);
};
g.B = function(a, b) {
  return jf(this, b);
};
g.aa = function() {
  return cd(ng, this.o);
};
g.Hc = function(a, b) {
  var c = [null], d = ig(this.Ia, this.pb, b, c);
  return null == d ? null == Q.a(c, 0) ? this : new lg(this.Ia, null, 0, this.o, null) : new lg(this.Ia, d.Xa(), this.l - 1, this.o, null);
};
g.sb = function(a, b, c) {
  a = [null];
  var d = eg(this.Ia, this.pb, b, c, a);
  return null == d ? (a = Q.a(a, 0), C.a(c, a.w) ? this : new lg(this.Ia, kg(this.Ia, this.pb, b, c), this.l, this.o, null)) : new lg(this.Ia, d.Xa(), this.l + 1, this.o, null);
};
g.Dc = function(a, b) {
  return null != mg(this, b);
};
g.X = function() {
  var a;
  0 < this.l ? (a = this.l, a = new Yf(null, Xf(this.pb, null, !0), !0, a, null)) : a = null;
  return a;
};
g.Y = function(a, b) {
  return new lg(this.Ia, this.pb, this.l, b, this.q);
};
g.V = function(a, b) {
  if (td(b)) {
    return Hb(this, z.a(b, 0), z.a(b, 1));
  }
  for (var c = this, d = F(b);;) {
    if (null == d) {
      return c;
    }
    var e = G(d);
    if (td(e)) {
      c = Hb(c, z.a(e, 0), z.a(e, 1)), d = K(d);
    } else {
      throw Error("conj on a map takes map entries or seqables of map entries");
    }
  }
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
var ng = new lg(Lc, null, 0, null, 0), oe = function() {
  function a(a) {
    var d = null;
    0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
    return b.call(this, d);
  }
  function b(a) {
    a = F(a);
    for (var b = lc(yf);;) {
      if (a) {
        var e = K(K(a)), b = ge.g(b, G(a), ed(a));
        a = e;
      } else {
        return nc(b);
      }
    }
  }
  a.D = 0;
  a.s = function(a) {
    a = F(a);
    return b(a);
  };
  a.j = b;
  return a;
}(), og = function() {
  function a(a) {
    var d = null;
    0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
    return b.call(this, d);
  }
  function b(a) {
    return new s(null, Id(O(a)), S.a(mb, a), null);
  }
  a.D = 0;
  a.s = function(a) {
    a = F(a);
    return b(a);
  };
  a.j = b;
  return a;
}();
function pg(a, b) {
  this.ta = a;
  this.ua = b;
  this.F = 0;
  this.p = 32374988;
}
g = pg.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.ua;
};
g.pa = function() {
  var a = this.ta, a = (a ? a.p & 128 || a.Ic || (a.p ? 0 : u(Cb, a)) : u(Cb, a)) ? this.ta.pa(null) : K(this.ta);
  return null == a ? null : new pg(a, this.ua);
};
g.J = function() {
  return Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.ua);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return this.ta.ga(null).kc(null);
};
g.ma = function() {
  var a = this.ta, a = (a ? a.p & 128 || a.Ic || (a.p ? 0 : u(Cb, a)) : u(Cb, a)) ? this.ta.pa(null) : K(this.ta);
  return null != a ? new pg(a, this.ua) : J;
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new pg(this.ta, b);
};
g.V = function(a, b) {
  return N(b, this);
};
function tf(a) {
  return(a = F(a)) ? new pg(a, null) : null;
}
function Bf(a) {
  return Lb(a);
}
function qg(a, b) {
  this.ta = a;
  this.ua = b;
  this.F = 0;
  this.p = 32374988;
}
g = qg.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.R = function() {
  return this.ua;
};
g.pa = function() {
  var a = this.ta, a = (a ? a.p & 128 || a.Ic || (a.p ? 0 : u(Cb, a)) : u(Cb, a)) ? this.ta.pa(null) : K(this.ta);
  return null == a ? null : new qg(a, this.ua);
};
g.J = function() {
  return Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.ua);
};
g.ha = function(a, b) {
  return dd.a(b, this);
};
g.ia = function(a, b, c) {
  return dd.g(b, c, this);
};
g.ga = function() {
  return this.ta.ga(null).lc(null);
};
g.ma = function() {
  var a = this.ta, a = (a ? a.p & 128 || a.Ic || (a.p ? 0 : u(Cb, a)) : u(Cb, a)) ? this.ta.pa(null) : K(this.ta);
  return null != a ? new qg(a, this.ua) : J;
};
g.X = function() {
  return this;
};
g.Y = function(a, b) {
  return new qg(this.ta, b);
};
g.V = function(a, b) {
  return N(b, this);
};
function uf(a) {
  return(a = F(a)) ? new qg(a, null) : null;
}
function Cf(a) {
  return Mb(a);
}
var rg = function() {
  function a(a) {
    var d = null;
    0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
    return b.call(this, d);
  }
  function b(a) {
    return t(le(Fd, a)) ? nb.a(function(a, b) {
      return gd.a(t(a) ? a : wf, b);
    }, a) : null;
  }
  a.D = 0;
  a.s = function(a) {
    a = F(a);
    return b(a);
  };
  a.j = b;
  return a;
}();
function sg(a, b, c) {
  this.o = a;
  this.Fb = b;
  this.q = c;
  this.p = 15077647;
  this.F = 8196;
}
g = sg.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.keys = function() {
  return lf(F(this));
};
g.entries = function() {
  return pf(F(this));
};
g.values = function() {
  return lf(F(this));
};
g.has = function(a) {
  return Cd(this, a);
};
g.forEach = function(a) {
  for (var b = F(this), c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e), h = Q.g(f, 0, null), f = Q.g(f, 1, null);
      a.a ? a.a(f, h) : a.call(null, f, h);
      e += 1;
    } else {
      if (b = F(b)) {
        ud(b) ? (c = rc(b), b = sc(b), h = c, d = O(c), c = h) : (c = G(b), h = Q.g(c, 0, null), c = f = Q.g(c, 1, null), a.a ? a.a(c, h) : a.call(null, c, h), b = K(b), c = null, d = 0), e = 0;
      } else {
        return null;
      }
    }
  }
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  return Fb(this.Fb, b) ? b : c;
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new sg(this.o, this.Fb, this.q);
};
g.ca = function() {
  return ub(this.Fb);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Qc(this);
};
g.B = function(a, b) {
  return qd(b) && O(this) === O(b) && ke(function(a) {
    return function(b) {
      return Cd(a, b);
    };
  }(this), b);
};
g.Pb = function() {
  return new tg(lc(this.Fb));
};
g.aa = function() {
  return cd(ug, this.o);
};
g.X = function() {
  return tf(this.Fb);
};
g.Y = function(a, b) {
  return new sg(b, this.Fb, this.q);
};
g.V = function(a, b) {
  return new sg(this.o, jd.g(this.Fb, b, null), null);
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
var ug = new sg(null, wf, 0);
function tg(a) {
  this.ob = a;
  this.p = 259;
  this.F = 136;
}
g = tg.prototype;
g.call = function() {
  function a(a, b, c) {
    return Eb.g(this.ob, b, yd) === yd ? c : b;
  }
  function b(a, b) {
    return Eb.g(this.ob, b, yd) === yd ? null : b;
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return Eb.g(this.ob, a, yd) === yd ? null : a;
};
g.a = function(a, b) {
  return Eb.g(this.ob, a, yd) === yd ? b : a;
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  return Eb.g(this.ob, b, yd) === yd ? c : b;
};
g.ca = function() {
  return O(this.ob);
};
g.Ab = function(a, b) {
  this.ob = ge.g(this.ob, b, null);
  return this;
};
g.Bb = function() {
  return new sg(null, nc(this.ob), null);
};
function vg(a, b, c) {
  this.o = a;
  this.bc = b;
  this.q = c;
  this.p = 417730831;
  this.F = 8192;
}
g = vg.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.keys = function() {
  return lf(F(this));
};
g.entries = function() {
  return pf(F(this));
};
g.values = function() {
  return lf(F(this));
};
g.has = function(a) {
  return Cd(this, a);
};
g.forEach = function(a) {
  for (var b = F(this), c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e), h = Q.g(f, 0, null), f = Q.g(f, 1, null);
      a.a ? a.a(f, h) : a.call(null, f, h);
      e += 1;
    } else {
      if (b = F(b)) {
        ud(b) ? (c = rc(b), b = sc(b), h = c, d = O(c), c = h) : (c = G(b), h = Q.g(c, 0, null), c = f = Q.g(c, 1, null), a.a ? a.a(c, h) : a.call(null, c, h), b = K(b), c = null, d = 0), e = 0;
      } else {
        return null;
      }
    }
  }
};
g.G = function(a, b) {
  return Eb.g(this, b, null);
};
g.H = function(a, b, c) {
  a = mg(this.bc, b);
  return null != a ? a.key : c;
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new vg(this.o, this.bc, this.q);
};
g.ca = function() {
  return O(this.bc);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Qc(this);
};
g.B = function(a, b) {
  return qd(b) && O(this) === O(b) && ke(function(a) {
    return function(b) {
      return Cd(a, b);
    };
  }(this), b);
};
g.aa = function() {
  return cd(wg, this.o);
};
g.X = function() {
  return tf(this.bc);
};
g.Y = function(a, b) {
  return new vg(b, this.bc, this.q);
};
g.V = function(a, b) {
  return new vg(this.o, jd.g(this.bc, b, null), null);
};
g.call = function() {
  var a = null, a = function(a, c, d) {
    switch(arguments.length) {
      case 2:
        return this.G(null, c);
      case 3:
        return this.H(null, c, d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  a.a = function(a, c) {
    return this.G(null, c);
  };
  a.g = function(a, c, d) {
    return this.H(null, c, d);
  };
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.e = function(a) {
  return this.G(null, a);
};
g.a = function(a, b) {
  return this.H(null, a, b);
};
var wg = new vg(null, ng, 0);
function Qd(a) {
  if (a && (a.F & 4096 || a.se)) {
    return a.name;
  }
  if ("string" === typeof a) {
    return a;
  }
  throw Error("Doesn't support name: " + x.e(a));
}
function xg(a, b, c) {
  this.A = a;
  this.end = b;
  this.step = c;
}
xg.prototype.Qc = function() {
  return 0 < this.step ? this.A < this.end : this.A > this.end;
};
xg.prototype.next = function() {
  var a = this.A;
  this.A += this.step;
  return a;
};
function yg(a, b, c, d, e) {
  this.o = a;
  this.start = b;
  this.end = c;
  this.step = d;
  this.q = e;
  this.p = 32375006;
  this.F = 8192;
}
g = yg.prototype;
g.toString = function() {
  return yc(this);
};
g.equiv = function(a) {
  return this.B(null, a);
};
g.K = function(a, b) {
  if (b < ub(this)) {
    return this.start + b * this.step;
  }
  if (this.start > this.end && 0 === this.step) {
    return this.start;
  }
  throw Error("Index out of bounds");
};
g.va = function(a, b, c) {
  return b < ub(this) ? this.start + b * this.step : this.start > this.end && 0 === this.step ? this.start : c;
};
g.ic = function() {
  return new xg(this.start, this.end, this.step);
};
g.R = function() {
  return this.o;
};
g.wa = function() {
  return new yg(this.o, this.start, this.end, this.step, this.q);
};
g.pa = function() {
  return 0 < this.step ? this.start + this.step < this.end ? new yg(this.o, this.start + this.step, this.end, this.step, null) : null : this.start + this.step > this.end ? new yg(this.o, this.start + this.step, this.end, this.step, null) : null;
};
g.ca = function() {
  if (hb(ec(this))) {
    return 0;
  }
  var a = (this.end - this.start) / this.step;
  return Math.ceil.e ? Math.ceil.e(a) : Math.ceil.call(null, a);
};
g.J = function() {
  var a = this.q;
  return null != a ? a : this.q = a = Pc(this);
};
g.B = function(a, b) {
  return $c(this, b);
};
g.aa = function() {
  return cd(J, this.o);
};
g.ha = function(a, b) {
  return Vc.a(this, b);
};
g.ia = function(a, b, c) {
  for (a = this.start;;) {
    if (0 < this.step ? a < this.end : a > this.end) {
      var d = a;
      c = b.a ? b.a(c, d) : b.call(null, c, d);
      if (Uc(c)) {
        return b = c, M.e ? M.e(b) : M.call(null, b);
      }
      a += this.step;
    } else {
      return c;
    }
  }
};
g.ga = function() {
  return null == ec(this) ? null : this.start;
};
g.ma = function() {
  return null != ec(this) ? new yg(this.o, this.start + this.step, this.end, this.step, null) : J;
};
g.X = function() {
  return 0 < this.step ? this.start < this.end ? this : null : this.start > this.end ? this : null;
};
g.Y = function(a, b) {
  return new yg(b, this.start, this.end, this.step, this.q);
};
g.V = function(a, b) {
  return N(b, this);
};
var zg = function() {
  function a(a, b) {
    for (;;) {
      if (F(b) && 0 < a) {
        var c = a - 1, h = K(b);
        a = c;
        b = h;
      } else {
        return null;
      }
    }
  }
  function b(a) {
    for (;;) {
      if (F(a)) {
        a = K(a);
      } else {
        return null;
      }
    }
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), Ag = function() {
  function a(a, b) {
    zg.a(a, b);
    return b;
  }
  function b(a) {
    zg.e(a);
    return a;
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function Bg(a, b) {
  if ("string" === typeof b) {
    var c = a.exec(b);
    return C.a(G(c), b) ? 1 === O(c) ? G(c) : Ue(c) : null;
  }
  throw new TypeError("re-matches must match against a string.");
}
function Cg(a, b) {
  if ("string" === typeof b) {
    var c = a.exec(b);
    return null == c ? null : 1 === O(c) ? G(c) : Ue(c);
  }
  throw new TypeError("re-find must match against a string.");
}
function Dg(a) {
  if (a instanceof RegExp) {
    return a;
  }
  var b = Cg(/^(?:\(\?([idmsux]*)\))?(.*)/, a);
  Q.g(b, 0, null);
  a = Q.g(b, 1, null);
  b = Q.g(b, 2, null);
  return new RegExp(b, a);
}
function Eg(a, b, c, d, e, f, h) {
  var k = Za;
  try {
    Za = null == Za ? null : Za - 1;
    if (null != Za && 0 > Za) {
      return A(a, "#");
    }
    A(a, c);
    if (F(h)) {
      var l = G(h);
      b.g ? b.g(l, a, f) : b.call(null, l, a, f);
    }
    for (var m = K(h), n = gb.e(f) - 1;;) {
      if (!m || null != n && 0 === n) {
        F(m) && 0 === n && (A(a, d), A(a, "..."));
        break;
      } else {
        A(a, d);
        var p = G(m);
        c = a;
        h = f;
        b.g ? b.g(p, c, h) : b.call(null, p, c, h);
        var r = K(m);
        c = n - 1;
        m = r;
        n = c;
      }
    }
    return A(a, e);
  } finally {
    Za = k;
  }
}
var Fg = function() {
  function a(a, d) {
    var e = null;
    1 < arguments.length && (e = L(Array.prototype.slice.call(arguments, 1), 0));
    return b.call(this, a, e);
  }
  function b(a, b) {
    for (var e = F(b), f = null, h = 0, k = 0;;) {
      if (k < h) {
        var l = f.K(null, k);
        A(a, l);
        k += 1;
      } else {
        if (e = F(e)) {
          f = e, ud(f) ? (e = rc(f), h = sc(f), f = e, l = O(e), e = h, h = l) : (l = G(f), A(a, l), e = K(f), f = null, h = 0), k = 0;
        } else {
          return null;
        }
      }
    }
  }
  a.D = 1;
  a.s = function(a) {
    var d = G(a);
    a = I(a);
    return b(d, a);
  };
  a.j = b;
  return a;
}(), Gg = {'"':'\\"', "\\":"\\\\", "\b":"\\b", "\f":"\\f", "\n":"\\n", "\r":"\\r", "\t":"\\t"};
function Ig(a) {
  return'"' + x.e(a.replace(RegExp('[\\\\"\b\f\n\r\t]', "g"), function(a) {
    return Gg[a];
  })) + '"';
}
var Lg = function Jg(b, c, d) {
  if (null == b) {
    return A(c, "nil");
  }
  if (void 0 === b) {
    return A(c, "#\x3cundefined\x3e");
  }
  t(function() {
    var c = R.a(d, eb);
    return t(c) ? (c = b ? b.p & 131072 || b.re ? !0 : b.p ? !1 : u(Ub, b) : u(Ub, b)) ? nd(b) : c : c;
  }()) && (A(c, "^"), Jg(nd(b), c, d), A(c, " "));
  if (null == b) {
    return A(c, "nil");
  }
  if (b.we) {
    return b.Se(b, c, d);
  }
  if (b && (b.p & 2147483648 || b.W)) {
    return b.L(null, c, d);
  }
  if (ib(b) === Boolean || "number" === typeof b) {
    return A(c, "" + x.e(b));
  }
  if (null != b && b.constructor === Object) {
    A(c, "#js ");
    var e = ue.a(function(c) {
      return new U(null, 2, 5, W, [Rd.e(c), b[c]], null);
    }, vd(b));
    return Kg.v ? Kg.v(e, Jg, c, d) : Kg.call(null, e, Jg, c, d);
  }
  return b instanceof Array ? Eg(c, Jg, "#js [", " ", "]", d, b) : t(ga(b)) ? t(bb.e(d)) ? A(c, Ig(b)) : A(c, b) : ld(b) ? Fg.j(c, L(["#\x3c", "" + x.e(b), "\x3e"], 0)) : b instanceof Date ? (e = function(b, c) {
    for (var d = "" + x.e(b);;) {
      if (O(d) < c) {
        d = "0" + x.e(d);
      } else {
        return d;
      }
    }
  }, Fg.j(c, L(['#inst "', "" + x.e(b.getUTCFullYear()), "-", e(b.getUTCMonth() + 1, 2), "-", e(b.getUTCDate(), 2), "T", e(b.getUTCHours(), 2), ":", e(b.getUTCMinutes(), 2), ":", e(b.getUTCSeconds(), 2), ".", e(b.getUTCMilliseconds(), 3), "-", '00:00"'], 0))) : b instanceof RegExp ? Fg.j(c, L(['#"', b.source, '"'], 0)) : (b ? b.p & 2147483648 || b.W || (b.p ? 0 : u(gc, b)) : u(gc, b)) ? hc(b, c, d) : Fg.j(c, L(["#\x3c", "" + x.e(b), "\x3e"], 0));
};
function Mg(a, b) {
  var c = new La;
  a: {
    var d = new xc(c);
    Lg(G(a), d, b);
    for (var e = F(K(a)), f = null, h = 0, k = 0;;) {
      if (k < h) {
        var l = f.K(null, k);
        A(d, " ");
        Lg(l, d, b);
        k += 1;
      } else {
        if (e = F(e)) {
          f = e, ud(f) ? (e = rc(f), h = sc(f), f = e, l = O(e), e = h, h = l) : (l = G(f), A(d, " "), Lg(l, d, b), e = K(f), f = null, h = 0), k = 0;
        } else {
          break a;
        }
      }
    }
  }
  return c;
}
var se = function() {
  function a(a) {
    var d = null;
    0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
    return b.call(this, d);
  }
  function b(a) {
    var b = $a();
    return od(a) ? "" : "" + x.e(Mg(a, b));
  }
  a.D = 0;
  a.s = function(a) {
    a = F(a);
    return b(a);
  };
  a.j = b;
  return a;
}();
function Kg(a, b, c, d) {
  return Eg(c, function(a, c, d) {
    var k = Lb(a);
    b.g ? b.g(k, c, d) : b.call(null, k, c, d);
    A(c, " ");
    a = Mb(a);
    return b.g ? b.g(a, c, d) : b.call(null, a, c, d);
  }, "{", ", ", "}", d, F(a));
}
Nc.prototype.W = !0;
Nc.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Sd.prototype.W = !0;
Sd.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Yf.prototype.W = !0;
Yf.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Rf.prototype.W = !0;
Rf.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Y.prototype.W = !0;
Y.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "[", " ", "]", c, this);
};
rf.prototype.W = !0;
rf.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
vg.prototype.W = !0;
vg.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "#{", " ", "}", c, this);
};
We.prototype.W = !0;
We.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Od.prototype.W = !0;
Od.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
bd.prototype.W = !0;
bd.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Tf.prototype.W = !0;
Tf.prototype.L = function(a, b, c) {
  return Kg(this, Lg, b, c);
};
Sf.prototype.W = !0;
Sf.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Ze.prototype.W = !0;
Ze.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "[", " ", "]", c, this);
};
lg.prototype.W = !0;
lg.prototype.L = function(a, b, c) {
  return Kg(this, Lg, b, c);
};
sg.prototype.W = !0;
sg.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "#{", " ", "}", c, this);
};
Xd.prototype.W = !0;
Xd.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
ne.prototype.W = !0;
ne.prototype.L = function(a, b, c) {
  A(b, "#\x3cAtom: ");
  Lg(this.state, b, c);
  return A(b, "\x3e");
};
qg.prototype.W = !0;
qg.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
X.prototype.W = !0;
X.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "[", " ", "]", c, this);
};
U.prototype.W = !0;
U.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "[", " ", "]", c, this);
};
df.prototype.W = !0;
df.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Md.prototype.W = !0;
Md.prototype.L = function(a, b) {
  return A(b, "()");
};
ef.prototype.W = !0;
ef.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "#queue [", " ", "]", c, F(this));
};
s.prototype.W = !0;
s.prototype.L = function(a, b, c) {
  return Kg(this, Lg, b, c);
};
yg.prototype.W = !0;
yg.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
pg.prototype.W = !0;
pg.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
Ld.prototype.W = !0;
Ld.prototype.L = function(a, b, c) {
  return Eg(b, Lg, "(", " ", ")", c, this);
};
U.prototype.Ec = !0;
U.prototype.Fc = function(a, b) {
  return Dd.a(this, b);
};
Ze.prototype.Ec = !0;
Ze.prototype.Fc = function(a, b) {
  return Dd.a(this, b);
};
T.prototype.Ec = !0;
T.prototype.Fc = function(a, b) {
  return Kc(this, b);
};
E.prototype.Ec = !0;
E.prototype.Fc = function(a, b) {
  return Kc(this, b);
};
var Ng = null, Og = function() {
  function a(a) {
    null == Ng && (Ng = qe.e ? qe.e(0) : qe.call(null, 0));
    return Mc.e("" + x.e(a) + x.e(te.a(Ng, Rc)));
  }
  function b() {
    return c.e("G__");
  }
  var c = null, c = function(c) {
    switch(arguments.length) {
      case 0:
        return b.call(this);
      case 1:
        return a.call(this, c);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.C = b;
  c.e = a;
  return c;
}(), Pg = {};
function Qg(a) {
  if (a ? a.me : a) {
    return a.me(a);
  }
  var b;
  b = Qg[q(null == a ? null : a)];
  if (!b && (b = Qg._, !b)) {
    throw w("IEncodeJS.-clj-\x3ejs", a);
  }
  return b.call(null, a);
}
function Rg(a) {
  return(a ? t(t(null) ? null : a.le) || (a.Mc ? 0 : u(Pg, a)) : u(Pg, a)) ? Qg(a) : "string" === typeof a || "number" === typeof a || a instanceof T || a instanceof E ? Sg.e ? Sg.e(a) : Sg.call(null, a) : se.j(L([a], 0));
}
var Sg = function Tg(b) {
  if (null == b) {
    return null;
  }
  if (b ? t(t(null) ? null : b.le) || (b.Mc ? 0 : u(Pg, b)) : u(Pg, b)) {
    return Qg(b);
  }
  if (b instanceof T) {
    return Qd(b);
  }
  if (b instanceof E) {
    return "" + x.e(b);
  }
  if (sd(b)) {
    var c = {};
    b = F(b);
    for (var d = null, e = 0, f = 0;;) {
      if (f < e) {
        var h = d.K(null, f), k = Q.g(h, 0, null), h = Q.g(h, 1, null);
        c[Rg(k)] = Tg(h);
        f += 1;
      } else {
        if (b = F(b)) {
          ud(b) ? (e = rc(b), b = sc(b), d = e, e = O(e)) : (e = G(b), d = Q.g(e, 0, null), e = Q.g(e, 1, null), c[Rg(d)] = Tg(e), b = K(b), d = null, e = 0), f = 0;
        } else {
          break;
        }
      }
    }
    return c;
  }
  if (pd(b)) {
    c = [];
    b = F(ue.a(Tg, b));
    d = null;
    for (f = e = 0;;) {
      if (f < e) {
        k = d.K(null, f), c.push(k), f += 1;
      } else {
        if (b = F(b)) {
          d = b, ud(d) ? (b = rc(d), f = sc(d), d = b, e = O(b), b = f) : (b = G(d), c.push(b), b = K(d), d = null, e = 0), f = 0;
        } else {
          break;
        }
      }
    }
    return c;
  }
  return b;
}, Ug = {};
function Vg(a, b) {
  if (a ? a.ke : a) {
    return a.ke(a, b);
  }
  var c;
  c = Vg[q(null == a ? null : a)];
  if (!c && (c = Vg._, !c)) {
    throw w("IEncodeClojure.-js-\x3eclj", a);
  }
  return c.call(null, a, b);
}
var Xg = function() {
  function a(a) {
    return b.j(a, L([new s(null, 1, [Wg, !1], null)], 0));
  }
  var b = null, c = function() {
    function a(c, d) {
      var k = null;
      1 < arguments.length && (k = L(Array.prototype.slice.call(arguments, 1), 0));
      return b.call(this, c, k);
    }
    function b(a, c) {
      if (a ? t(t(null) ? null : a.Le) || (a.Mc ? 0 : u(Ug, a)) : u(Ug, a)) {
        return Vg(a, S.a(og, c));
      }
      if (F(c)) {
        var d = zd(c) ? S.a(oe, c) : c, e = R.a(d, Wg);
        return function(a, b, c, d) {
          return function y(e) {
            return zd(e) ? Ag.e(ue.a(y, e)) : pd(e) ? ye.a(null == e ? null : vb(e), ue.a(y, e)) : e instanceof Array ? Ue(ue.a(y, e)) : ib(e) === Object ? ye.a(wf, function() {
              return function(a, b, c, d) {
                return function db(f) {
                  return new Sd(null, function(a, b, c, d) {
                    return function() {
                      for (;;) {
                        var a = F(f);
                        if (a) {
                          if (ud(a)) {
                            var b = rc(a), c = O(b), h = new Ud(Array(c), 0);
                            return function() {
                              for (var a = 0;;) {
                                if (a < c) {
                                  var f = z.a(b, a), k = h, l = W, m;
                                  m = f;
                                  m = d.e ? d.e(m) : d.call(null, m);
                                  f = new U(null, 2, 5, l, [m, y(e[f])], null);
                                  k.add(f);
                                  a += 1;
                                } else {
                                  return!0;
                                }
                              }
                            }() ? Yd(h.Fa(), db(sc(a))) : Yd(h.Fa(), null);
                          }
                          var k = G(a);
                          return N(new U(null, 2, 5, W, [function() {
                            var a = k;
                            return d.e ? d.e(a) : d.call(null, a);
                          }(), y(e[k])], null), db(I(a)));
                        }
                        return null;
                      }
                    };
                  }(a, b, c, d), null, null);
                };
              }(a, b, c, d)(vd(e));
            }()) : e;
          };
        }(c, d, e, t(e) ? Rd : x)(a);
      }
      return null;
    }
    a.D = 1;
    a.s = function(a) {
      var c = G(a);
      a = I(a);
      return b(c, a);
    };
    a.j = b;
    return a;
  }(), b = function(b, e) {
    switch(arguments.length) {
      case 1:
        return a.call(this, b);
      default:
        return c.j(b, L(arguments, 1));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 1;
  b.s = c.s;
  b.e = a;
  b.j = c.j;
  return b;
}(), Yg = {};
function Zg(a) {
  this.yb = a;
  this.F = 0;
  this.p = 2153775104;
}
g = Zg.prototype;
g.J = function() {
  for (var a = se.j(L([this], 0)), b = 0, c = 0;c < a.length;++c) {
    b = 31 * b + a.charCodeAt(c), b %= 4294967296;
  }
  return b;
};
g.L = function(a, b) {
  return A(b, '#uuid "' + x.e(this.yb) + '"');
};
g.B = function(a, b) {
  return b instanceof Zg && this.yb === b.yb;
};
g.toString = function() {
  return this.yb;
};
g.equiv = function(a) {
  return this.B(null, a);
};
var $g = new T(null, "response", "response", -1068424192), ah = new T(null, "description", "description", -1428560544), bh = new T(null, "finally", "finally", 1589088705), ch = new T(null, "format", "format", -1306924766), dh = new T(null, "original-text", "original-text", 744448452), eb = new T(null, "meta", "meta", 1499536964), eh = new T(null, "keywords?", "keywords?", 764949733), fb = new T(null, "dup", "dup", 556298533), fh = new T(null, "read", "read", 1140058661), gh = new T(null, "failure", 
"failure", 720415879), pe = new T(null, "validator", "validator", -1966190681), hh = new T(null, "method", "method", 55703592), ih = new T(null, "raw", "raw", 1604651272), jh = new T(null, "value", "value", 305978217), kh = new T(null, "response-format", "response-format", 1664465322), lh = new T(null, "status-text", "status-text", -1834235478), mh = new T(null, "aborted", "aborted", 1775972619), nh = new T(null, "params", "params", 710516235), oh = new T(null, "type", "type", 1174270348), ph = new T(null, 
"handlers", "handlers", 79528781), ab = new T(null, "flush-on-newline", "flush-on-newline", -151457939), qh = new T(null, "defaults", "defaults", 976027214), rh = new T(null, "parse-error", "parse-error", 255902478), sh = new T(null, "prefix", "prefix", -265908465), th = new T(null, "headers", "headers", -835030129), uh = new T(null, "error-handler", "error-handler", -484945776), vh = new T(null, "write", "write", -1857649168), wh = new T(null, "div", "div", 1057191632), bb = new T(null, "readably", 
"readably", 1129599760), xh = new T(null, "manager", "manager", -818607470), yh = new T(null, "priority", "priority", 1431093715), zh = new T(null, "status", "status", -1997798413), gb = new T(null, "print-length", "print-length", 1931866356), Ah = new T(null, "writer", "writer", -277568236), Bh = new T(null, "id", "id", -1388402092), Ch = new T(null, "reader", "reader", 169660853), Dh = new T(null, "parse", "parse", -1162164619), Eh = new T(null, "content-type", "content-type", -508222634), Fh = 
new T(null, "max-retries", "max-retries", -1933762121), Gh = new T(null, "error", "error", -978969032), Hh = new T(null, "exception", "exception", -335277064), Ih = new T(null, "uri", "uri", -774711847), Jh = new T(null, "tag", "tag", -1290361223), Kh = new T(null, "input", "input", 556931961), Lh = new T(null, "json", "json", 1279968570), Mh = new T(null, "timeout", "timeout", -318625318), Nh = new T(null, "h1", "h1", -1896887462), Oh = new T(null, "on-change", "on-change", -732046149), Ph = new T(null, 
"handler", "handler", -195596612), Wg = new T(null, "keywordize-keys", "keywordize-keys", 1310784252);
function Qh(a) {
  return a.toUpperCase();
}
function Rh(a, b) {
  if (0 >= b || b >= 2 + O(a)) {
    return gd.a(Ue(N("", ue.a(x, F(a)))), "");
  }
  if (t(C.a ? C.a(1, b) : C.call(null, 1, b))) {
    return new U(null, 1, 5, W, [a], null);
  }
  if (t(C.a ? C.a(2, b) : C.call(null, 2, b))) {
    return new U(null, 2, 5, W, ["", a], null);
  }
  var c = b - 2;
  return gd.a(Ue(N("", Xe.g(Ue(ue.a(x, F(a))), 0, c))), Kd.a(a, c));
}
var Sh = function() {
  function a(a, b, c) {
    if (C.a("" + x.e(b), "/(?:)/")) {
      b = Rh(a, c);
    } else {
      if (1 > c) {
        b = Ue(("" + x.e(a)).split(b));
      } else {
        a: {
          for (var h = c, k = fd;;) {
            if (C.a(h, 1)) {
              b = gd.a(k, a);
              break a;
            }
            var l = Cg(b, a);
            if (t(l)) {
              var m = l, l = a.indexOf(m), m = a.substring(l + O(m)), h = h - 1, k = gd.a(k, a.substring(0, l));
              a = m;
            } else {
              b = gd.a(k, a);
              break a;
            }
          }
          b = void 0;
        }
      }
    }
    if (C.a(0, c)) {
      a: {
        for (c = b;;) {
          if (C.a("", null == c ? null : Ob(c))) {
            c = null == c ? null : Qb(c);
          } else {
            break a;
          }
        }
        c = void 0;
      }
    } else {
      c = b;
    }
    return c;
  }
  function b(a, b) {
    return c.g(a, b, 0);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}();
var Th, Uh = "undefined" !== typeof window && null != window.document;
function Vh(a, b) {
  return a.cljsReactClass = b;
}
function Wh(a) {
  return function(b) {
    return function(c) {
      var d = R.a(M.e ? M.e(b) : M.call(null, b), c);
      if (null != d) {
        return d;
      }
      d = a.e ? a.e(c) : a.call(null, c);
      te.v(b, jd, c, d);
      return d;
    };
  }(function() {
    var a = wf;
    return qe.e ? qe.e(a) : qe.call(null, a);
  }());
}
var Xh = new sg(null, new s(null, 2, ["aria", null, "data", null], null), null);
function Yh(a) {
  return 2 > O(a) ? Qh(a) : "" + x.e(Qh(Kd.g(a, 0, 1))) + x.e(Kd.a(a, 1));
}
function Zh(a) {
  if ("string" === typeof a) {
    return a;
  }
  a = Qd(a);
  var b = Sh.a(a, /-/), c = Q.g(b, 0, null), d;
  a: {
    d = 1;
    for (b = F(b);;) {
      if (b && 0 < d) {
        d -= 1, b = K(b);
      } else {
        d = b;
        break a;
      }
    }
    d = void 0;
  }
  return t(Xh.e ? Xh.e(c) : Xh.call(null, c)) ? a : S.g(x, c, ue.a(Yh, d));
}
function $h(a, b, c) {
  this.Db = a;
  this.fc = b;
  this.Xb = c;
  this.F = 0;
  this.p = 6291457;
}
g = $h.prototype;
g.J = function() {
  return Ic(new U(null, 2, 5, W, [this.Db, this.fc], null));
};
g.B = function(a, b) {
  return C.a(this.Db, b.Db) && C.a(this.fc, b.fc);
};
g.call = function() {
  function a(a, d) {
    a = this;
    var e = null;
    1 < arguments.length && (e = L(Array.prototype.slice.call(arguments, 1), 0));
    return b.call(this, a, e);
  }
  function b(a, b) {
    t(a.Xb) || (a.Xb = S.g(me, a.Db, a.fc));
    return S.a(a.Xb, b);
  }
  a.D = 1;
  a.s = function(a) {
    var d = G(a);
    a = I(a);
    return b(d, a);
  };
  a.j = b;
  return a;
}();
g.apply = function(a, b) {
  return this.call.apply(this, [this].concat(lb(b)));
};
g.a = function() {
  function a(a) {
    var d = null;
    0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
    return b.call(this, d);
  }
  function b(a) {
    t(self__.Xb) || (self__.Xb = S.g(me, self__.Db, self__.fc));
    return S.a(self__.Xb, a);
  }
  a.D = 0;
  a.s = function(a) {
    a = F(a);
    return b(a);
  };
  a.j = b;
  return a;
}();
function ai(a) {
  var b = Bd(a);
  return b ? b : a ? a.F & 256 || a.Ne ? !0 : a.F ? !1 : u(Yg, a) : u(Yg, a);
}
function bi(a) {
  return null == a ? null : 9 === a.nodeType ? a.documentElement : a.firstChild;
}
function ci(a) {
  a = bi(a);
  return null == a ? null : a.getAttribute("data-reactid");
}
var di, ei = wf;
di = qe.e ? qe.e(ei) : qe.call(null, ei);
function fi(a, b, c) {
  return React.renderComponent(a.C ? a.C() : a.call(null), b, function() {
    var d = ci(b);
    null != d && te.v(di, jd, d, function() {
      return function() {
        var c;
        try {
          c = React.renderComponent(a.C ? a.C() : a.call(null), b);
        } catch (d) {
          if (d instanceof Object) {
            try {
              React.unmountComponentAtNode(b);
            } catch (h) {
              if (h instanceof Object) {
                "undefined" !== typeof console && console.log(h);
              } else {
                throw h;
              }
            }
            c = bi(b);
            t(c) && (c.removeAttribute("data-reactid"), c.innerHTML = "");
          }
          throw d;
        }
        return c;
      };
    }(d));
    return null == c ? null : c.C ? c.C() : c.call(null);
  });
}
var gi = {};
function hi(a, b) {
  return Pd(a, b) || (a instanceof E || ib(a) === $h) && C.a(a, b);
}
var ji = function ii(b, c) {
  var d = b === c;
  if (d) {
    return d;
  }
  var e = sd(b);
  if (e) {
    var f = sd(c);
    if (f) {
      var h = O(b) === O(c);
      return h ? Ed(function() {
        return function(b, d, e) {
          var f = R.g(c, d, gi);
          return t(function() {
            var b = e === f;
            return b || (b = hi(e, f)) ? b : (b = Pd(d, Jh)) ? ii(e, f) : b;
          }()) ? b : new Tc(!1);
        };
      }(h, f, e, d), !0, b) : h;
    }
    return f;
  }
  return e;
};
function ki(a, b) {
  if (!td(a)) {
    throw Error("Assert failed: " + x.e(se.j(L([Nd(new E(null, "vector?", "vector?", -61367869, null), new E(null, "v1", "v1", -2141311508, null))], 0))));
  }
  if (!td(b)) {
    throw Error("Assert failed: " + x.e(se.j(L([Nd(new E(null, "vector?", "vector?", -61367869, null), new E(null, "v2", "v2", 1875554983, null))], 0))));
  }
  var c = a === b;
  if (c) {
    return c;
  }
  var d = O(a) === O(b);
  return d ? Ed(function() {
    return function(a, c, d) {
      var k = Q.a(b, c);
      return t(function() {
        var a = d === k;
        return a || (a = hi(d, k)) ? a : (a = sd(d)) ? ji(d, k) : a;
      }()) ? a : new Tc(!1);
    };
  }(d, c), !0, a) : d;
}
;var li, mi = qe.e ? qe.e(0) : qe.call(null, 0);
function ni(a, b) {
  b.Nc = null;
  var c = li;
  try {
    return li = b, a.C ? a.C() : a.call(null);
  } finally {
    li = c;
  }
}
function oi(a) {
  var b = a.Nc;
  a.Nc = null;
  return b;
}
function pi(a) {
  var b = li;
  if (null != b) {
    var c = b.Nc;
    b.Nc = gd.a(null == c ? ug : c, a);
  }
}
function qi(a, b, c, d) {
  this.state = a;
  this.o = b;
  this.cc = c;
  this.la = d;
  this.p = 2153938944;
  this.F = 114690;
}
g = qi.prototype;
g.J = function() {
  return ja(this);
};
g.Kc = function(a, b, c) {
  return Ed(function(a) {
    return function(e, f, h) {
      h.v ? h.v(f, a, b, c) : h.call(null, f, a, b, c);
      return null;
    };
  }(this), null, this.la);
};
g.Jc = function(a, b, c) {
  return this.la = jd.g(this.la, b, c);
};
g.Lc = function(a, b) {
  return this.la = kd.a(this.la, b);
};
g.L = function(a, b, c) {
  A(b, "#\x3cAtom: ");
  Lg(this.state, b, c);
  return A(b, "\x3e");
};
g.R = function() {
  return this.o;
};
g.md = function(a, b) {
  var c = uc, d;
  d = this.state;
  d = b.e ? b.e(d) : b.call(null, d);
  return c(this, d);
};
g.nd = function(a, b, c) {
  a = uc;
  var d = this.state;
  b = b.a ? b.a(d, c) : b.call(null, d, c);
  return a(this, b);
};
g.od = function(a, b, c, d) {
  a = uc;
  var e = this.state;
  b = b.g ? b.g(e, c, d) : b.call(null, e, c, d);
  return a(this, b);
};
g.pd = function(a, b, c, d, e) {
  return uc(this, S.Q(b, this.state, c, d, e));
};
g.ld = function(a, b) {
  if (null != this.cc && !t(this.cc.e ? this.cc.e(b) : this.cc.call(null, b))) {
    throw Error("Assert failed: Validator rejected reference state\n" + x.e(se.j(L([Nd(new E(null, "validator", "validator", -325659154, null), new E(null, "new-value", "new-value", -1567397401, null))], 0))));
  }
  var c = this.state;
  this.state = b;
  null != this.la && ic(this, c, b);
  return b;
};
g.hc = function() {
  pi(this);
  return this.state;
};
g.B = function(a, b) {
  return this === b;
};
var ri = function() {
  function a(a) {
    return new qi(a, null, null, null);
  }
  var b = null, c = function() {
    function a(c, d) {
      var k = null;
      1 < arguments.length && (k = L(Array.prototype.slice.call(arguments, 1), 0));
      return b.call(this, c, k);
    }
    function b(a, c) {
      var d = zd(c) ? S.a(oe, c) : c, e = R.a(d, pe), d = R.a(d, eb);
      return new qi(a, d, e, null);
    }
    a.D = 1;
    a.s = function(a) {
      var c = G(a);
      a = I(a);
      return b(c, a);
    };
    a.j = b;
    return a;
  }(), b = function(b, e) {
    switch(arguments.length) {
      case 1:
        return a.call(this, b);
      default:
        return c.j(b, L(arguments, 1));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 1;
  b.s = c.s;
  b.e = a;
  b.j = c.j;
  return b;
}();
function si(a) {
  if (a ? a.Yd : a) {
    return a.Yd();
  }
  var b;
  b = si[q(null == a ? null : a)];
  if (!b && (b = si._, !b)) {
    throw w("IDisposable.dispose!", a);
  }
  return b.call(null, a);
}
function ti(a) {
  if (a ? a.Zd : a) {
    return a.Zd();
  }
  var b;
  b = ti[q(null == a ? null : a)];
  if (!b && (b = ti._, !b)) {
    throw w("IRunnable.run", a);
  }
  return b.call(null, a);
}
function ui(a, b) {
  if (a ? a.yd : a) {
    return a.yd(0, b);
  }
  var c;
  c = ui[q(null == a ? null : a)];
  if (!c && (c = ui._, !c)) {
    throw w("IComputedImpl.-update-watching", a);
  }
  return c.call(null, a, b);
}
function vi(a, b, c, d) {
  if (a ? a.Xd : a) {
    return a.Xd(0, 0, c, d);
  }
  var e;
  e = vi[q(null == a ? null : a)];
  if (!e && (e = vi._, !e)) {
    throw w("IComputedImpl.-handle-change", a);
  }
  return e.call(null, a, b, c, d);
}
function wi(a, b, c, d) {
  return Ed(function(b, f, h) {
    h.v ? h.v(f, a, c, d) : h.call(null, f, a, c, d);
    return null;
  }, null, b);
}
function xi(a, b, c, d, e, f, h, k, l) {
  this.Db = a;
  this.state = b;
  this.pc = c;
  this.ec = d;
  this.Kb = e;
  this.la = f;
  this.zc = h;
  this.Uc = k;
  this.Tc = l;
  this.p = 2153807872;
  this.F = 114690;
}
g = xi.prototype;
g.Xd = function(a, b, c, d) {
  var e = this;
  return t(function() {
    var a = e.ec;
    return t(a) ? hb(e.pc) && c !== d : a;
  }()) ? (e.pc = !0, function() {
    var a = e.zc;
    return t(a) ? a : ti;
  }().call(null, this)) : null;
};
g.yd = function(a, b) {
  for (var c = F(b), d = null, e = 0, f = 0;;) {
    if (f < e) {
      var h = d.K(null, f);
      Cd(this.Kb, h) || jc(h, this, vi);
      f += 1;
    } else {
      if (c = F(c)) {
        d = c, ud(d) ? (c = rc(d), f = sc(d), d = c, e = O(c), c = f) : (c = G(d), Cd(this.Kb, c) || jc(c, this, vi), c = K(d), d = null, e = 0), f = 0;
      } else {
        break;
      }
    }
  }
  c = F(this.Kb);
  d = null;
  for (f = e = 0;;) {
    if (f < e) {
      h = d.K(null, f), Cd(b, h) || kc(h, this), f += 1;
    } else {
      if (c = F(c)) {
        d = c, ud(d) ? (c = rc(d), f = sc(d), d = c, e = O(c), c = f) : (c = G(d), Cd(b, c) || kc(c, this), c = K(d), d = null, e = 0), f = 0;
      } else {
        break;
      }
    }
  }
  return this.Kb = b;
};
g.L = function(a, b, c) {
  A(b, "#\x3cReaction " + x.e(Ic(this)) + ": ");
  Lg(this.state, b, c);
  return A(b, "\x3e");
};
g.J = function() {
  return ja(this);
};
g.B = function(a, b) {
  return this === b;
};
g.Yd = function() {
  for (var a = F(this.Kb), b = null, c = 0, d = 0;;) {
    if (d < c) {
      var e = b.K(null, d);
      kc(e, this);
      d += 1;
    } else {
      if (a = F(a)) {
        b = a, ud(b) ? (a = rc(b), d = sc(b), b = a, c = O(a), a = d) : (a = G(b), kc(a, this), a = K(b), b = null, c = 0), d = 0;
      } else {
        break;
      }
    }
  }
  this.Kb = ug;
  this.state = null;
  this.pc = !0;
  t(this.ec) && (t(!1) && te.a(mi, Hd), this.ec = !1);
  return t(this.Tc) ? this.Tc.C ? this.Tc.C() : this.Tc.call(null) : null;
};
g.ld = function(a, b) {
  var c = this.state;
  this.state = b;
  ic(this, c, b);
  return b;
};
g.md = function(a, b) {
  var c = uc, d;
  d = this.state;
  d = b.e ? b.e(d) : b.call(null, d);
  return c(this, d);
};
g.nd = function(a, b, c) {
  a = uc;
  var d = this.state;
  b = b.a ? b.a(d, c) : b.call(null, d, c);
  return a(this, b);
};
g.od = function(a, b, c, d) {
  a = uc;
  var e = this.state;
  b = b.g ? b.g(e, c, d) : b.call(null, e, c, d);
  return a(this, b);
};
g.pd = function(a, b, c, d, e) {
  return uc(this, S.Q(b, this.state, c, d, e));
};
g.Zd = function() {
  var a = this.state, b = ni(this.Db, this), c = oi(this);
  ie.a(c, this.Kb) && ui(this, c);
  t(this.ec) || (t(!1) && te.a(mi, Rc), this.ec = !0);
  this.pc = !1;
  this.state = b;
  wi(this, this.la, a, this.state);
  return b;
};
g.Kc = function(a, b, c) {
  t(this.Uc) && (this.Uc.a ? this.Uc.a(b, c) : this.Uc.call(null, b, c));
  return wi(this, this.la, b, c);
};
g.Jc = function(a, b, c) {
  return this.la = jd.g(this.la, b, c);
};
g.Lc = function(a, b) {
  this.la = kd.a(this.la, b);
  return od(this.la) ? si(this) : null;
};
g.hc = function() {
  var a = this;
  if (hb(function() {
    var b = a.zc;
    return t(b) ? b : li;
  }())) {
    var b = new U(null, 2, 5, W, [a.zc, li], null);
    "undefined" !== typeof console && console.log("" + x.e("dbg reagent.ratom:231: [auto-run *ratom-context*]: " + x.e(se.j(L([b], 0)))));
  }
  if (!t(function() {
    var b = a.zc;
    return t(b) ? b : li;
  }())) {
    throw Error("Assert failed: Reaction derefed outside auto-running context\n" + x.e(se.j(L([Nd(new E(null, "or", "or", 1876275696, null), new E(null, "auto-run", "auto-run", -696035332, null), new E(null, "*ratom-context*", "*ratom-context*", -1557728360, null))], 0))));
  }
  pi(this);
  return t(a.pc) ? ti(this) : a.state;
};
var yi = function() {
  function a(a, d) {
    var e = null;
    1 < arguments.length && (e = L(Array.prototype.slice.call(arguments, 1), 0));
    return b.call(this, a, e);
  }
  function b(a, b) {
    var e = zd(b) ? S.a(oe, b) : b, f = R.a(e, Mh), h = R.a(e, Fh), k = R.a(e, yh), e = R.a(e, Bh), e = C.a(e, !0) ? ti : e, l = null != f, h = new xi(a, null, !l, l, null, wf, e, k, h);
    null != f && (t(!1) && te.a(mi, Rc), h.yd(0, f));
    return h;
  }
  a.D = 1;
  a.s = function(a) {
    var d = G(a);
    a = I(a);
    return b(d, a);
  };
  a.j = b;
  return a;
}();
function zi(a) {
  return setTimeout(a, 16);
}
var Ai = hb(Uh) ? zi : function() {
  var a = window, b = a.requestAnimationFrame;
  if (t(b)) {
    return b;
  }
  b = a.webkitRequestAnimationFrame;
  if (t(b)) {
    return b;
  }
  b = a.mozRequestAnimationFrame;
  if (t(b)) {
    return b;
  }
  a = a.msRequestAnimationFrame;
  return t(a) ? a : zi;
}();
function Bi(a, b) {
  return a.props.level - b.props.level;
}
function Ci() {
  var a = Di;
  if (t(a.zd)) {
    return null;
  }
  a.zd = !0;
  a = function(a) {
    return function() {
      var c = a.xd;
      a.xd = [];
      a.zd = !1;
      a: {
        c.sort(Bi);
        for (var d = c.length, e = 0;;) {
          if (e < d) {
            var f = c[e];
            t(f.cljsIsDirty) && f.forceUpdate();
            e += 1;
          } else {
            c = null;
            break a;
          }
        }
        c = void 0;
      }
      return c;
    };
  }(a);
  return Ai.e ? Ai.e(a) : Ai.call(null, a);
}
var Di = new function() {
  this.xd = [];
  this.zd = !1;
};
function Ei(a) {
  a.cljsIsDirty = !0;
  Di.xd.push(a);
  return Ci();
}
function Fi(a) {
  a = null == a ? null : a.props;
  return null == a ? null : a.argv;
}
function Gi(a, b) {
  if (!t(Fi(a))) {
    throw Error("Assert failed: " + x.e(se.j(L([Nd(new E(null, "is-reagent-component", "is-reagent-component", -1856228005, null), new E(null, "c", "c", -122660552, null))], 0))));
  }
  a.cljsIsDirty = !1;
  var c = a.cljsRatom;
  if (null == c) {
    var d = ni(b, a), e = oi(a);
    null != e && (a.cljsRatom = yi.j(b, L([Bh, function() {
      return function() {
        return Ei(a);
      };
    }(d, e, c), Mh, e], 0)));
    return d;
  }
  return ti(c);
}
function Hi(a) {
  var b = a.cljsRatom;
  null == b || si(b);
  return a.cljsIsDirty = !1;
}
;function Ii(a) {
  var b = a.cljsState;
  return null != b ? b : a.cljsState = ri.e(null);
}
var Ki = function Ji(b) {
  var c = b.cljsRender;
  if (!ai(c)) {
    throw Error("Assert failed: " + x.e(se.j(L([Nd(new E("util", "clj-ifn?", "util/clj-ifn?", 259370460, null), new E(null, "f", "f", 43394975, null))], 0))));
  }
  var d = b.props, e = null == b.componentFunction ? c.e ? c.e(b) : c.call(null, b) : function() {
    var b = d.argv;
    switch(O(b)) {
      case 1:
        return c.C ? c.C() : c.call(null);
      case 2:
        return b = Q.a(b, 1), c.e ? c.e(b) : c.call(null, b);
      case 3:
        var e = Q.a(b, 1), b = Q.a(b, 2);
        return c.a ? c.a(e, b) : c.call(null, e, b);
      case 4:
        var e = Q.a(b, 1), k = Q.a(b, 2), b = Q.a(b, 3);
        return c.g ? c.g(e, k, b) : c.call(null, e, k, b);
      case 5:
        var e = Q.a(b, 1), k = Q.a(b, 2), l = Q.a(b, 3), b = Q.a(b, 4);
        return c.v ? c.v(e, k, l, b) : c.call(null, e, k, l, b);
      default:
        return S.a(c, Xe.a(b, 1));
    }
  }();
  return td(e) ? b.asComponent(e, d.level) : Bd(e) ? (b.cljsRender = e, Ji(b)) : e;
};
function Li(a, b) {
  var c = a instanceof T ? a.Da : null;
  switch(c) {
    case "componentWillUnmount":
      return function() {
        return function() {
          Hi(this);
          return null == b ? null : b.e ? b.e(this) : b.call(null, this);
        };
      }(c);
    case "componentDidUpdate":
      return function() {
        return function(a) {
          a = a.argv;
          return b.a ? b.a(this, a) : b.call(null, this, a);
        };
      }(c);
    case "componentWillUpdate":
      return function() {
        return function(a) {
          a = a.argv;
          return b.a ? b.a(this, a) : b.call(null, this, a);
        };
      }(c);
    case "shouldComponentUpdate":
      return function() {
        return function(a) {
          var c = Th;
          if (t(c)) {
            return c;
          }
          c = this.props.argv;
          a = a.argv;
          return null == b ? hb(ki(c, a)) : b.g ? b.g(this, c, a) : b.call(null, this, c, a);
        };
      }(c);
    case "componentWillReceiveProps":
      return function() {
        return function(a) {
          a = a.argv;
          return b.a ? b.a(this, a) : b.call(null, this, a);
        };
      }(c);
    case "getInitialState":
      return function() {
        return function() {
          var a = b.e ? b.e(this) : b.call(null, this);
          return te.g(Ii(this), rg, a);
        };
      }(c);
    case "getDefaultProps":
      throw Error("Assert failed: getDefaultProps not supported yet\n" + x.e(se.j(L([!1], 0))));;
    default:
      return null;
  }
}
function Mi(a) {
  return Bd(a) ? function() {
    function b(a) {
      var b = null;
      0 < arguments.length && (b = L(Array.prototype.slice.call(arguments, 0), 0));
      return c.call(this, b);
    }
    function c(b) {
      return S.g(a, this, b);
    }
    b.D = 0;
    b.s = function(a) {
      a = F(a);
      return c(a);
    };
    b.j = c;
    return b;
  }() : a;
}
var Ni = new sg(null, new s(null, 3, [fh, null, ah, null, vh, null], null), null);
function Oi(a) {
  Bd(a) && (a.__reactDontBind = !0);
  return a;
}
function Pi(a, b, c) {
  if (t(Ni.e ? Ni.e(a) : Ni.call(null, a))) {
    return Oi(b);
  }
  var d = Li(a, b);
  if (t(t(d) ? b : d) && !Bd(b)) {
    throw Error("Assert failed: " + x.e("Expected function in " + x.e(c) + x.e(a) + " but got " + x.e(b)) + "\n" + x.e(se.j(L([Nd(new E(null, "ifn?", "ifn?", -2106461064, null), new E(null, "f", "f", 43394975, null))], 0))));
  }
  return t(d) ? d : Mi(b);
}
var Qi = new s(null, 2, [Eh, null, Ah, null], null), Ri = Wh(Zh);
function Ti(a) {
  return Ed(function(a, c, d) {
    return jd.g(a, Rd.e(Ri.e ? Ri.e(c) : Ri.call(null, c)), d);
  }, wf, a);
}
function Ui(a) {
  return rg.j(L([Qi, a], 0));
}
function Vi(a, b) {
  return jd.j(a, fh, b, L([ah, t(Uh) ? function() {
    return Gi(this, function(a) {
      return function() {
        return Ki(a);
      };
    }(this));
  } : function() {
    return Ki(this);
  }], 0));
}
function Wi(a) {
  var b = function() {
    var b = vh.e(a);
    return t(b) ? b : ah.e(a);
  }();
  if (!ai(b)) {
    throw Error("Assert failed: " + x.e("Render must be a function, not " + x.e(se.j(L([b], 0)))) + "\n" + x.e(se.j(L([Nd(new E("util", "clj-ifn?", "util/clj-ifn?", 259370460, null), new E(null, "render-fun", "render-fun", -1209513086, null))], 0))));
  }
  var c = null, d = function() {
    var c = oh.e(a);
    if (t(c)) {
      return c;
    }
    c = b.displayName;
    return t(c) ? c : b.name;
  }(), e = od(d) ? "" + x.e(Og.e("reagent")) : d, f = Vi(jd.g(a, oh, e), b);
  return Ed(function(a, b, c, d) {
    return function(a, b, c) {
      return jd.g(a, b, Pi(b, c, d));
    };
  }(b, c, d, e, f), wf, f);
}
function Xi(a) {
  return Ed(function(a, c, d) {
    a[Qd(c)] = d;
    return a;
  }, {}, a);
}
function Yi(a) {
  var b = Zi;
  if (!sd(a)) {
    throw Error("Assert failed: " + x.e(se.j(L([Nd(new E(null, "map?", "map?", -1780568534, null), new E(null, "body", "body", -408674142, null))], 0))));
  }
  var c = Xi(Wi(Ui(Ti(a)))), d = c.asComponent = Oi(b);
  a = React.createClass(c);
  c = function(a, c, d) {
    return function() {
      function a(b) {
        var d = null;
        0 < arguments.length && (d = L(Array.prototype.slice.call(arguments, 0), 0));
        return c.call(this, d);
      }
      function c(a) {
        a = S.g(Ve, d, a);
        return b.e ? b.e(a) : b.call(null, a);
      }
      a.D = 0;
      a.s = function(a) {
        a = F(a);
        return c(a);
      };
      a.j = c;
      return a;
    }();
  }(c, d, a);
  Vh(c, a);
  Vh(a, a);
  return c;
}
;var $i = /([^\s\.#]+)(?:#([^\s\.#]+))?(?:\.([^\s#]+))?/, aj = new s(null, 3, [ph, "className", Lh, "htmlFor", ih, "charSet"], null);
function bj(a) {
  return a instanceof T || a instanceof E || "string" === typeof a;
}
function cj(a) {
  return "string" === typeof a ? a : "number" === typeof a ? a : a instanceof T ? Qd(a) : a instanceof E ? "" + x.e(a) : pd(a) ? Sg(a) : Bd(a) ? function() {
    function b(a) {
      var b = null;
      0 < arguments.length && (b = L(Array.prototype.slice.call(arguments, 0), 0));
      return c.call(this, b);
    }
    function c(b) {
      return S.a(a, b);
    }
    b.D = 0;
    b.s = function(a) {
      a = F(a);
      return c(a);
    };
    b.j = c;
    return b;
  }() : a;
}
var dj = Wh(function(a) {
  var b = aj.e ? aj.e(a) : aj.call(null, a);
  return t(b) ? b : Zh(a);
});
Wh(Zh);
function ej(a) {
  return "string" === typeof a ? a : "number" === typeof a ? a : sd(a) ? Ed(function(a, c, d) {
    a[dj.e ? dj.e(c) : dj.call(null, c)] = cj(d);
    return a;
  }, {}, a) : cj(a);
}
function fj(a, b) {
  var c = Q.g(b, 0, null), d = Q.g(b, 1, null), e = a.id;
  a.id = null != e ? e : c;
  null != d && (c = a.className, a.className = null != c ? "" + x.e(d) + " " + x.e(c) : d);
}
function gj(a, b) {
  if (od(a) && null == b) {
    return null;
  }
  if (ib(a) === Object) {
    return a;
  }
  var c = Ed(function(a, b, c) {
    b = dj.e ? dj.e(b) : dj.call(null, b);
    "key" !== b && (a[b] = ej(c));
    return a;
  }, {}, a);
  null != b && fj(c, b);
  return c;
}
function hj(a, b) {
  var c = b.onChange, d = null == c ? null : b.value;
  a.cljsInputValue = d;
  if (null == d) {
    return null;
  }
  a.cljsIsDirty = !1;
  b.defaultValue = d;
  b.value = null;
  b.onChange = function(b, c) {
    return function(b) {
      b = c.e ? c.e(b) : c.call(null, b);
      Ei(a);
      return b;
    };
  }(b, c, d);
  return b;
}
function ij(a) {
  var b = React.DOM;
  return a === b.input || a === b.textarea;
}
function jj(a) {
  a.componentDidUpdate = function() {
    return function() {
      var a;
      a = this.cljsInputValue;
      if (null == a) {
        a = null;
      } else {
        var c = this.getDOMNode();
        a = ie.a(a, c.value) ? c.value = a : null;
      }
      return a;
    };
  }(a);
  a.componentWillUnmount = function() {
    return function() {
      return Hi(this);
    };
  }(a);
}
function kj(a, b, c) {
  var d = ij(a), e = d ? hj : null;
  c = {displayName:t(c) ? c : "ComponentWrapper", shouldComponentUpdate:function() {
    return function(a) {
      var b = Th;
      return t(b) ? b : hb(ki(this.props.argv, a.argv));
    };
  }(d, e), render:function(c, d) {
    return function() {
      var c = this.props, e = c.argv, f = Q.g(e, 1, null), n = null == f || sd(f), p = n ? 2 : 1, c = c.level + 1, e = lj.g ? lj.g(e, p, c) : lj.call(null, e, p, c), f = gj(n ? f : null, b);
      null != d && (d.a ? d.a(this, f) : d.call(null, this, f));
      e[0] = f;
      return a.apply(null, e);
    };
  }(d, e)};
  d && jj(c);
  return React.createClass(c);
}
var mj = Wh(function(a) {
  var b, c = K(Bg($i, Qd(a)));
  b = Q.g(c, 0, null);
  var d = Q.g(c, 1, null), c = Q.g(c, 2, null);
  b = React.DOM[b];
  if (t(c)) {
    var e = /\./;
    if ("string" === typeof e) {
      c = c.replace(new RegExp(String(e).replace(/([-()\[\]{}+?*.$\^|,:#<!\\])/g, "\\$1").replace(/\x08/g, "\\x08"), "g"), " ");
    } else {
      if (t(e.hasOwnProperty("source"))) {
        c = c.replace(new RegExp(e.source, "g"), " ");
      } else {
        throw "Invalid match arg: " + x.e(e);
      }
    }
  } else {
    c = null;
  }
  if (!t(b)) {
    throw Error("Assert failed: " + x.e("Unknown tag: '" + x.e(a) + "'") + "\n" + x.e(se.j(L([new E(null, "comp", "comp", -1462482139, null)], 0))));
  }
  b = new U(null, 2, 5, W, [b, t(t(d) ? d : c) ? new U(null, 2, 5, W, [d, c], null) : null], null);
  d = Q.g(b, 0, null);
  b = Q.g(b, 1, null);
  return kj(d, b, "" + x.e(a));
});
function nj(a) {
  return sd(a) ? R.a(a, eh) : null;
}
function oj(a, b) {
  if (!(0 < O(a))) {
    throw Error("Assert failed: Hiccup form should not be empty\n" + x.e(se.j(L([Nd(new E(null, "pos?", "pos?", -244377722, null), Nd(new E(null, "count", "count", -514511684, null), new E(null, "v", "v", 1661996586, null)))], 0))));
  }
  var c = Q.a(a, 0);
  if (!bj(c) && !ai(c)) {
    throw Error("Assert failed: " + x.e("Invalid Hiccup form: " + x.e(se.j(L([a], 0)))) + "\n" + x.e(se.j(L([Nd(new E(null, "valid-tag?", "valid-tag?", 1243064160, null), Nd(new E(null, "nth", "nth", 1529209554, null), new E(null, "v", "v", 1661996586, null), 0))], 0))));
  }
  c = Q.a(a, 0);
  if (bj(c)) {
    c = mj.e ? mj.e(c) : mj.call(null, c);
  } else {
    var d = c.cljsReactClass;
    null != d ? c = d : t(React.isValidClass(c)) ? c = Vh(c, kj(c, null, null)) : (d = nd(c), d = jd.g(d, Ch, c), d = (pj.e ? pj.e(d) : pj.call(null, d)).cljsReactClass, Vh(c, d), c = d);
  }
  var d = {level:b, argv:a}, e = nj(nd(a)), e = null == e ? nj(Q.g(a, 1, null)) : e;
  null != e && (d.key = e);
  return c.e ? c.e(d) : c.call(null, d);
}
var qj = {}, Zi = function() {
  function a(a, b) {
    if ("string" === typeof a) {
      return a;
    }
    if (td(a)) {
      return oj(a, b);
    }
    if (zd(a)) {
      if (null != li) {
        return rj.a ? rj.a(a, b) : rj.call(null, a, b);
      }
      var c = ni(function() {
        return rj.a ? rj.a(a, b) : rj.call(null, a, b);
      }, qj);
      t(oi(qj)) && (t(qj.warned) || ("undefined" !== typeof console && console.log("Warning: Reactive deref not supported in seq in ", se.j(L([a], 0))), qj.warned = !0));
      return c;
    }
    return a;
  }
  function b(a) {
    return c.a(a, 0);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function pj(a) {
  return Yi(a);
}
function rj(a, b) {
  for (var c = ob.e(a), d = b + 1, e = c.length, f = 0;;) {
    if (f < e) {
      c[f] = Zi.a(c[f], d), f += 1;
    } else {
      break;
    }
  }
  return c;
}
function lj(a, b, c) {
  return O(a) === b + 1 ? [null, Zi.a(Q.a(a, b), c)] : Ed(function(a, e, f) {
    e >= b && a.push(Zi.a(f, c));
    return a;
  }, [null], a);
}
;var sj = function() {
  function a(a, b, c) {
    return fi(function() {
      var b = ld(a) ? a.C ? a.C() : a.call(null) : a;
      return Zi.e(b);
    }, b, c);
  }
  function b(a, b) {
    return c.g(a, b, null);
  }
  var c = null, c = function(c, e, f) {
    switch(arguments.length) {
      case 2:
        return b.call(this, c, e);
      case 3:
        return a.call(this, c, e, f);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.a = b;
  c.g = a;
  return c;
}();
ca("reagent.core.force_update_all", function() {
  var a = Th;
  try {
    Th = !0;
    for (var b = F(uf(M.e ? M.e(di) : M.call(null, di))), c = null, d = 0, e = 0;;) {
      if (e < d) {
        var f = c.K(null, e);
        f.C ? f.C() : f.call(null);
        e += 1;
      } else {
        var h = F(b);
        if (h) {
          var k = h;
          if (ud(k)) {
            var l = rc(k), m = sc(k), k = l, n = O(l), b = m, c = k, d = n
          } else {
            var p = G(k);
            p.C ? p.C() : p.call(null);
            b = K(k);
            c = null;
            d = 0;
          }
          e = 0;
        } else {
          break;
        }
      }
    }
  } finally {
    Th = a;
  }
  return "Updated";
});
var tj = function() {
  function a(a) {
    return ri.e(a);
  }
  var b = null, c = function() {
    function a(c, d) {
      var k = null;
      1 < arguments.length && (k = L(Array.prototype.slice.call(arguments, 1), 0));
      return b.call(this, c, k);
    }
    function b(a, c) {
      return S.g(ri, a, c);
    }
    a.D = 1;
    a.s = function(a) {
      var c = G(a);
      a = I(a);
      return b(c, a);
    };
    a.j = b;
    return a;
  }(), b = function(b, e) {
    switch(arguments.length) {
      case 1:
        return a.call(this, b);
      default:
        return c.j(b, L(arguments, 1));
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.D = 1;
  b.s = c.s;
  b.e = a;
  b.j = c.j;
  return b;
}();
function uj(a) {
  return new U(null, 2, 5, W, [Kh, new s(null, 3, [oh, "text", jh, M.e ? M.e(a) : M.call(null, a), Oh, function(b) {
    b = b.target.value;
    return re.a ? re.a(a, b) : re.call(null, a, b);
  }], null)], null);
}
function vj() {
  return function(a) {
    return function() {
      return new U(null, 3, 5, W, [wh, new U(null, 2, 5, W, [Nh, M.e ? M.e(a) : M.call(null, a)], null), new U(null, 2, 5, W, [uj, a], null)], null);
    };
  }(tj.e("Joppa Driller"));
}
ca("helloworld.run", function() {
  return sj.a(new U(null, 1, 5, W, [vj], null), document.getElementById("hello-world-container"));
});
var wj;
a: {
  var xj = ba.navigator;
  if (xj) {
    var yj = xj.userAgent;
    if (yj) {
      wj = yj;
      break a;
    }
  }
  wj = "";
}
;var zj = -1 != wj.indexOf("Opera") || -1 != wj.indexOf("OPR"), Aj = -1 != wj.indexOf("Trident") || -1 != wj.indexOf("MSIE"), Bj = -1 != wj.indexOf("Gecko") && -1 == wj.toLowerCase().indexOf("webkit") && !(-1 != wj.indexOf("Trident") || -1 != wj.indexOf("MSIE")), Cj = -1 != wj.toLowerCase().indexOf("webkit");
function Dj() {
  var a = ba.document;
  return a ? a.documentMode : void 0;
}
var Ej = function() {
  var a = "", b;
  if (zj && ba.opera) {
    return a = ba.opera.version, ha(a) ? a() : a;
  }
  Bj ? b = /rv\:([^\);]+)(\)|;)/ : Aj ? b = /\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/ : Cj && (b = /WebKit\/(\S+)/);
  b && (a = (a = b.exec(wj)) ? a[1] : "");
  return Aj && (b = Dj(), b > parseFloat(a)) ? String(b) : a;
}(), Fj = {};
function Gj(a) {
  var b;
  if (!(b = Fj[a])) {
    b = 0;
    for (var c = String(Ej).replace(/^[\s\xa0]+|[\s\xa0]+$/g, "").split("."), d = String(a).replace(/^[\s\xa0]+|[\s\xa0]+$/g, "").split("."), e = Math.max(c.length, d.length), f = 0;0 == b && f < e;f++) {
      var h = c[f] || "", k = d[f] || "", l = RegExp("(\\d*)(\\D*)", "g"), m = RegExp("(\\d*)(\\D*)", "g");
      do {
        var n = l.exec(h) || ["", "", ""], p = m.exec(k) || ["", "", ""];
        if (0 == n[0].length && 0 == p[0].length) {
          break;
        }
        b = Ca(0 == n[1].length ? 0 : parseInt(n[1], 10), 0 == p[1].length ? 0 : parseInt(p[1], 10)) || Ca(0 == n[2].length, 0 == p[2].length) || Ca(n[2], p[2]);
      } while (0 == b);
    }
    b = Fj[a] = 0 <= b;
  }
  return b;
}
var Hj = ba.document, Ij = Hj && Aj ? Dj() || ("CSS1Compat" == Hj.compatMode ? parseInt(Ej, 10) : 5) : void 0;
var Jj;
(Jj = !Aj) || (Jj = Aj && 9 <= Ij);
var Kj = Jj, Lj = Aj && !Gj("9");
!Cj || Gj("528");
Bj && Gj("1.9b") || Aj && Gj("8") || zj && Gj("9.5") || Cj && Gj("528");
Bj && !Gj("8") || Aj && Gj("9");
function Mj() {
  0 != Nj && ja(this);
}
var Nj = 0;
Mj.prototype.ye = !1;
function Oj(a, b) {
  this.type = a;
  this.currentTarget = this.target = b;
  this.defaultPrevented = this.Yb = !1;
  this.ae = !0;
}
Oj.prototype.preventDefault = function() {
  this.defaultPrevented = !0;
  this.ae = !1;
};
function Pj(a) {
  Pj[" "](a);
  return a;
}
Pj[" "] = ea;
function Qj(a, b) {
  Oj.call(this, a ? a.type : "");
  this.relatedTarget = this.currentTarget = this.target = null;
  this.charCode = this.keyCode = this.button = this.screenY = this.screenX = this.clientY = this.clientX = this.offsetY = this.offsetX = 0;
  this.metaKey = this.shiftKey = this.altKey = this.ctrlKey = !1;
  this.Md = this.state = null;
  a && this.Ub(a, b);
}
qa(Qj, Oj);
Qj.prototype.Ub = function(a, b) {
  var c = this.type = a.type;
  this.target = a.target || a.srcElement;
  this.currentTarget = b;
  var d = a.relatedTarget;
  if (d) {
    if (Bj) {
      var e;
      a: {
        try {
          Pj(d.nodeName);
          e = !0;
          break a;
        } catch (f) {
        }
        e = !1;
      }
      e || (d = null);
    }
  } else {
    "mouseover" == c ? d = a.fromElement : "mouseout" == c && (d = a.toElement);
  }
  this.relatedTarget = d;
  this.offsetX = Cj || void 0 !== a.offsetX ? a.offsetX : a.layerX;
  this.offsetY = Cj || void 0 !== a.offsetY ? a.offsetY : a.layerY;
  this.clientX = void 0 !== a.clientX ? a.clientX : a.pageX;
  this.clientY = void 0 !== a.clientY ? a.clientY : a.pageY;
  this.screenX = a.screenX || 0;
  this.screenY = a.screenY || 0;
  this.button = a.button;
  this.keyCode = a.keyCode || 0;
  this.charCode = a.charCode || ("keypress" == c ? a.keyCode : 0);
  this.ctrlKey = a.ctrlKey;
  this.altKey = a.altKey;
  this.shiftKey = a.shiftKey;
  this.metaKey = a.metaKey;
  this.state = a.state;
  this.Md = a;
  a.defaultPrevented && this.preventDefault();
};
Qj.prototype.preventDefault = function() {
  Qj.Fe.preventDefault.call(this);
  var a = this.Md;
  if (a.preventDefault) {
    a.preventDefault();
  } else {
    if (a.returnValue = !1, Lj) {
      try {
        if (a.ctrlKey || 112 <= a.keyCode && 123 >= a.keyCode) {
          a.keyCode = -1;
        }
      } catch (b) {
      }
    }
  }
};
var Rj = "closure_listenable_" + (1E6 * Math.random() | 0), Sj = 0;
function Tj(a, b, c, d, e) {
  this.Ib = a;
  this.Xc = null;
  this.src = b;
  this.type = c;
  this.Cc = !!d;
  this.vb = e;
  this.key = ++Sj;
  this.$b = this.Bc = !1;
}
function Uj(a) {
  a.$b = !0;
  a.Ib = null;
  a.Xc = null;
  a.src = null;
  a.vb = null;
}
;function Vj(a) {
  this.src = a;
  this.La = {};
  this.$c = 0;
}
Vj.prototype.add = function(a, b, c, d, e) {
  var f = a.toString();
  a = this.La[f];
  a || (a = this.La[f] = [], this.$c++);
  var h = Wj(a, b, d, e);
  -1 < h ? (b = a[h], c || (b.Bc = !1)) : (b = new Tj(b, this.src, f, !!d, e), b.Bc = c, a.push(b));
  return b;
};
Vj.prototype.remove = function(a, b, c, d) {
  a = a.toString();
  if (!(a in this.La)) {
    return!1;
  }
  var e = this.La[a];
  b = Wj(e, b, c, d);
  return-1 < b ? (Uj(e[b]), Qa.splice.call(e, b, 1), 0 == e.length && (delete this.La[a], this.$c--), !0) : !1;
};
function Xj(a, b) {
  var c = b.type;
  if (c in a.La) {
    var d = a.La[c], e = Ra(d, b), f;
    (f = 0 <= e) && Qa.splice.call(d, e, 1);
    f && (Uj(b), 0 == a.La[c].length && (delete a.La[c], a.$c--));
  }
}
Vj.prototype.sd = function(a, b, c, d) {
  a = this.La[a.toString()];
  var e = -1;
  a && (e = Wj(a, b, c, d));
  return-1 < e ? a[e] : null;
};
function Wj(a, b, c, d) {
  for (var e = 0;e < a.length;++e) {
    var f = a[e];
    if (!f.$b && f.Ib == b && f.Cc == !!c && f.vb == d) {
      return e;
    }
  }
  return-1;
}
;var Yj = "closure_lm_" + (1E6 * Math.random() | 0), Zj = {}, ak = 0;
function bk(a, b, c, d, e) {
  if ("array" == q(b)) {
    for (var f = 0;f < b.length;f++) {
      bk(a, b[f], c, d, e);
    }
  } else {
    if (c = ck(c), a && a[Rj]) {
      a.Sb.add(String(b), c, !1, d, e);
    } else {
      if (!b) {
        throw Error("Invalid event type");
      }
      var f = !!d, h = dk(a);
      h || (a[Yj] = h = new Vj(a));
      c = h.add(b, c, !1, d, e);
      c.Xc || (d = ek(), c.Xc = d, d.src = a, d.Ib = c, a.addEventListener ? a.addEventListener(b.toString(), d, f) : a.attachEvent(fk(b.toString()), d), ak++);
    }
  }
}
function ek() {
  var a = gk, b = Kj ? function(c) {
    return a.call(b.src, b.Ib, c);
  } : function(c) {
    c = a.call(b.src, b.Ib, c);
    if (!c) {
      return c;
    }
  };
  return b;
}
function hk(a, b, c, d, e) {
  if ("array" == q(b)) {
    for (var f = 0;f < b.length;f++) {
      hk(a, b[f], c, d, e);
    }
  } else {
    c = ck(c), a && a[Rj] ? a.Sb.remove(String(b), c, d, e) : a && (a = dk(a)) && (b = a.sd(b, c, !!d, e)) && ik(b);
  }
}
function ik(a) {
  if ("number" != typeof a && a && !a.$b) {
    var b = a.src;
    if (b && b[Rj]) {
      Xj(b.Sb, a);
    } else {
      var c = a.type, d = a.Xc;
      b.removeEventListener ? b.removeEventListener(c, d, a.Cc) : b.detachEvent && b.detachEvent(fk(c), d);
      ak--;
      (c = dk(b)) ? (Xj(c, a), 0 == c.$c && (c.src = null, b[Yj] = null)) : Uj(a);
    }
  }
}
function fk(a) {
  return a in Zj ? Zj[a] : Zj[a] = "on" + a;
}
function jk(a, b, c, d) {
  var e = 1;
  if (a = dk(a)) {
    if (b = a.La[b.toString()]) {
      for (b = b.concat(), a = 0;a < b.length;a++) {
        var f = b[a];
        f && f.Cc == c && !f.$b && (e &= !1 !== kk(f, d));
      }
    }
  }
  return Boolean(e);
}
function kk(a, b) {
  var c = a.Ib, d = a.vb || a.src;
  a.Bc && ik(a);
  return c.call(d, b);
}
function gk(a, b) {
  if (a.$b) {
    return!0;
  }
  if (!Kj) {
    var c = b || da("window.event"), d = new Qj(c, this), e = !0;
    if (!(0 > c.keyCode || void 0 != c.returnValue)) {
      a: {
        var f = !1;
        if (0 == c.keyCode) {
          try {
            c.keyCode = -1;
            break a;
          } catch (h) {
            f = !0;
          }
        }
        if (f || void 0 == c.returnValue) {
          c.returnValue = !0;
        }
      }
      c = [];
      for (f = d.currentTarget;f;f = f.parentNode) {
        c.push(f);
      }
      for (var f = a.type, k = c.length - 1;!d.Yb && 0 <= k;k--) {
        d.currentTarget = c[k], e &= jk(c[k], f, !0, d);
      }
      for (k = 0;!d.Yb && k < c.length;k++) {
        d.currentTarget = c[k], e &= jk(c[k], f, !1, d);
      }
    }
    return e;
  }
  return kk(a, new Qj(b, this));
}
function dk(a) {
  a = a[Yj];
  return a instanceof Vj ? a : null;
}
var lk = "__closure_events_fn_" + (1E9 * Math.random() >>> 0);
function ck(a) {
  if (ha(a)) {
    return a;
  }
  a[lk] || (a[lk] = function(b) {
    return a.handleEvent(b);
  });
  return a[lk];
}
;function mk() {
  Mj.call(this);
  this.Sb = new Vj(this);
  this.de = this;
  this.Wd = null;
}
qa(mk, Mj);
mk.prototype[Rj] = !0;
mk.prototype.addEventListener = function(a, b, c, d) {
  bk(this, a, b, c, d);
};
mk.prototype.removeEventListener = function(a, b, c, d) {
  hk(this, a, b, c, d);
};
mk.prototype.dispatchEvent = function(a) {
  var b, c = this.Wd;
  if (c) {
    for (b = [];c;c = c.Wd) {
      b.push(c);
    }
  }
  var c = this.de, d = a.type || a;
  if (ga(a)) {
    a = new Oj(a, c);
  } else {
    if (a instanceof Oj) {
      a.target = a.target || c;
    } else {
      var e = a;
      a = new Oj(d, c);
      Ka(a, e);
    }
  }
  var e = !0, f;
  if (b) {
    for (var h = b.length - 1;!a.Yb && 0 <= h;h--) {
      f = a.currentTarget = b[h], e = nk(f, d, !0, a) && e;
    }
  }
  a.Yb || (f = a.currentTarget = c, e = nk(f, d, !0, a) && e, a.Yb || (e = nk(f, d, !1, a) && e));
  if (b) {
    for (h = 0;!a.Yb && h < b.length;h++) {
      f = a.currentTarget = b[h], e = nk(f, d, !1, a) && e;
    }
  }
  return e;
};
function nk(a, b, c, d) {
  b = a.Sb.La[String(b)];
  if (!b) {
    return!0;
  }
  b = b.concat();
  for (var e = !0, f = 0;f < b.length;++f) {
    var h = b[f];
    if (h && !h.$b && h.Cc == c) {
      var k = h.Ib, l = h.vb || h.src;
      h.Bc && Xj(a.Sb, h);
      e = !1 !== k.call(l, d) && e;
    }
  }
  return e && !1 != d.ae;
}
mk.prototype.sd = function(a, b, c, d) {
  return this.Sb.sd(String(a), b, c, d);
};
function ok(a, b, c) {
  if (ha(a)) {
    c && (a = oa(a, c));
  } else {
    if (a && "function" == typeof a.handleEvent) {
      a = oa(a.handleEvent, a);
    } else {
      throw Error("Invalid listener argument");
    }
  }
  return 2147483647 < b ? -1 : ba.setTimeout(a, b || 0);
}
;function pk(a) {
  a = String(a);
  if (/^\s*$/.test(a) ? 0 : /^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g, "@").replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x0a-\x1f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g, ""))) {
    try {
      return eval("(" + a + ")");
    } catch (b) {
    }
  }
  throw Error("Invalid JSON string: " + a);
}
function qk() {
  this.Yc = void 0;
}
function rk(a, b, c) {
  switch(typeof b) {
    case "string":
      sk(b, c);
      break;
    case "number":
      c.push(isFinite(b) && !isNaN(b) ? b : "null");
      break;
    case "boolean":
      c.push(b);
      break;
    case "undefined":
      c.push("null");
      break;
    case "object":
      if (null == b) {
        c.push("null");
        break;
      }
      if ("array" == q(b)) {
        var d = b.length;
        c.push("[");
        for (var e = "", f = 0;f < d;f++) {
          c.push(e), e = b[f], rk(a, a.Yc ? a.Yc.call(b, String(f), e) : e, c), e = ",";
        }
        c.push("]");
        break;
      }
      c.push("{");
      d = "";
      for (f in b) {
        Object.prototype.hasOwnProperty.call(b, f) && (e = b[f], "function" != typeof e && (c.push(d), sk(f, c), c.push(":"), rk(a, a.Yc ? a.Yc.call(b, f, e) : e, c), d = ","));
      }
      c.push("}");
      break;
    case "function":
      break;
    default:
      throw Error("Unknown type: " + typeof b);;
  }
}
var tk = {'"':'\\"', "\\":"\\\\", "/":"\\/", "\b":"\\b", "\f":"\\f", "\n":"\\n", "\r":"\\r", "\t":"\\t", "\x0B":"\\u000b"}, uk = /\uffff/.test("\uffff") ? /[\\\"\x00-\x1f\x7f-\uffff]/g : /[\\\"\x00-\x1f\x7f-\xff]/g;
function sk(a, b) {
  b.push('"', a.replace(uk, function(a) {
    if (a in tk) {
      return tk[a];
    }
    var b = a.charCodeAt(0), e = "\\u";
    16 > b ? e += "000" : 256 > b ? e += "00" : 4096 > b && (e += "0");
    return tk[a] = e + b.toString(16);
  }), '"');
}
;function vk(a) {
  if ("function" == typeof a.mb) {
    return a.mb();
  }
  if (ga(a)) {
    return a.split("");
  }
  if (fa(a)) {
    for (var b = [], c = a.length, d = 0;d < c;d++) {
      b.push(a[d]);
    }
    return b;
  }
  return Ea(a);
}
function wk(a) {
  if ("function" == typeof a.Ka) {
    return a.Ka();
  }
  if ("function" != typeof a.mb) {
    if (fa(a) || ga(a)) {
      var b = [];
      a = a.length;
      for (var c = 0;c < a;c++) {
        b.push(c);
      }
      return b;
    }
    return Fa(a);
  }
}
function xk(a, b) {
  if ("function" == typeof a.forEach) {
    a.forEach(b, void 0);
  } else {
    if (fa(a) || ga(a)) {
      Sa(a, b, void 0);
    } else {
      for (var c = wk(a), d = vk(a), e = d.length, f = 0;f < e;f++) {
        b.call(void 0, d[f], c && c[f], a);
      }
    }
  }
}
;function yk(a, b) {
  this.Va = {};
  this.sa = [];
  this.ja = 0;
  var c = arguments.length;
  if (1 < c) {
    if (c % 2) {
      throw Error("Uneven number of arguments");
    }
    for (var d = 0;d < c;d += 2) {
      this.set(arguments[d], arguments[d + 1]);
    }
  } else {
    if (a) {
      a instanceof yk ? (c = a.Ka(), d = a.mb()) : (c = Fa(a), d = Ea(a));
      for (var e = 0;e < c.length;e++) {
        this.set(c[e], d[e]);
      }
    }
  }
}
g = yk.prototype;
g.Pd = function() {
  return this.ja;
};
g.mb = function() {
  zk(this);
  for (var a = [], b = 0;b < this.sa.length;b++) {
    a.push(this.Va[this.sa[b]]);
  }
  return a;
};
g.Ka = function() {
  zk(this);
  return this.sa.concat();
};
g.oc = function(a) {
  return Ak(this.Va, a);
};
g.ya = function(a, b) {
  if (this === a) {
    return!0;
  }
  if (this.ja != a.Pd()) {
    return!1;
  }
  var c = b || Bk;
  zk(this);
  for (var d, e = 0;d = this.sa[e];e++) {
    if (!c(this.get(d), a.get(d))) {
      return!1;
    }
  }
  return!0;
};
function Bk(a, b) {
  return a === b;
}
g.clear = function() {
  this.Va = {};
  this.ja = this.sa.length = 0;
};
g.remove = function(a) {
  return Ak(this.Va, a) ? (delete this.Va[a], this.ja--, this.sa.length > 2 * this.ja && zk(this), !0) : !1;
};
function zk(a) {
  if (a.ja != a.sa.length) {
    for (var b = 0, c = 0;b < a.sa.length;) {
      var d = a.sa[b];
      Ak(a.Va, d) && (a.sa[c++] = d);
      b++;
    }
    a.sa.length = c;
  }
  if (a.ja != a.sa.length) {
    for (var e = {}, c = b = 0;b < a.sa.length;) {
      d = a.sa[b], Ak(e, d) || (a.sa[c++] = d, e[d] = 1), b++;
    }
    a.sa.length = c;
  }
}
g.get = function(a, b) {
  return Ak(this.Va, a) ? this.Va[a] : b;
};
g.set = function(a, b) {
  Ak(this.Va, a) || (this.ja++, this.sa.push(a));
  this.Va[a] = b;
};
g.forEach = function(a, b) {
  for (var c = this.Ka(), d = 0;d < c.length;d++) {
    var e = c[d], f = this.get(e);
    a.call(b, f, e, this);
  }
};
g.clone = function() {
  return new yk(this);
};
function Ak(a, b) {
  return Object.prototype.hasOwnProperty.call(a, b);
}
;function Ck(a) {
  var b;
  b || (b = Dk(a || arguments.callee.caller, []));
  return b;
}
function Dk(a, b) {
  var c = [];
  if (0 <= Ra(b, a)) {
    c.push("[...circular reference...]");
  } else {
    if (a && 50 > b.length) {
      c.push(Ek(a) + "(");
      for (var d = a.arguments, e = 0;d && e < d.length;e++) {
        0 < e && c.push(", ");
        var f;
        f = d[e];
        switch(typeof f) {
          case "object":
            f = f ? "object" : "null";
            break;
          case "string":
            break;
          case "number":
            f = String(f);
            break;
          case "boolean":
            f = f ? "true" : "false";
            break;
          case "function":
            f = (f = Ek(f)) ? f : "[fn]";
            break;
          default:
            f = typeof f;
        }
        40 < f.length && (f = f.substr(0, 40) + "...");
        c.push(f);
      }
      b.push(a);
      c.push(")\n");
      try {
        c.push(Dk(a.caller, b));
      } catch (h) {
        c.push("[exception trying to get caller]\n");
      }
    } else {
      a ? c.push("[...long stack...]") : c.push("[end]");
    }
  }
  return c.join("");
}
function Ek(a) {
  if (Fk[a]) {
    return Fk[a];
  }
  a = String(a);
  if (!Fk[a]) {
    var b = /function ([^\(]+)/.exec(a);
    Fk[a] = b ? b[1] : "[Anonymous]";
  }
  return Fk[a];
}
var Fk = {};
function Gk(a, b, c, d, e) {
  this.reset(a, b, c, d, e);
}
Gk.prototype.Od = null;
Gk.prototype.Nd = null;
var Hk = 0;
Gk.prototype.reset = function(a, b, c, d, e) {
  "number" == typeof e || Hk++;
  d || pa();
  this.vc = a;
  this.Be = b;
  delete this.Od;
  delete this.Nd;
};
Gk.prototype.be = function(a) {
  this.vc = a;
};
function Ik(a) {
  this.Ce = a;
  this.Rd = this.fd = this.vc = this.Vc = null;
}
function Jk(a, b) {
  this.name = a;
  this.value = b;
}
Jk.prototype.toString = function() {
  return this.name;
};
var Kk = new Jk("SEVERE", 1E3), Lk = new Jk("CONFIG", 700), Mk = new Jk("FINE", 500);
Ik.prototype.getParent = function() {
  return this.Vc;
};
Ik.prototype.be = function(a) {
  this.vc = a;
};
function Nk(a) {
  if (a.vc) {
    return a.vc;
  }
  if (a.Vc) {
    return Nk(a.Vc);
  }
  Pa("Root logger has no level set.");
  return null;
}
Ik.prototype.log = function(a, b, c) {
  if (a.value >= Nk(this).value) {
    for (ha(b) && (b = b()), a = this.Qd(a, b, c, Ik.prototype.log), b = "log:" + a.Be, ba.console && (ba.console.timeStamp ? ba.console.timeStamp(b) : ba.console.markTimeline && ba.console.markTimeline(b)), ba.msWriteProfilerMark && ba.msWriteProfilerMark(b), b = this;b;) {
      c = b;
      var d = a;
      if (c.Rd) {
        for (var e = 0, f = void 0;f = c.Rd[e];e++) {
          f(d);
        }
      }
      b = b.getParent();
    }
  }
};
Ik.prototype.Qd = function(a, b, c, d) {
  a = new Gk(a, String(b), this.Ce);
  if (c) {
    a.Od = c;
    var e;
    d = d || Ik.prototype.Qd;
    try {
      var f;
      var h = da("window.location.href");
      if (ga(c)) {
        f = {message:c, name:"Unknown error", lineNumber:"Not available", fileName:h, stack:"Not available"};
      } else {
        var k, l;
        b = !1;
        try {
          k = c.lineNumber || c.Ue || "Not available";
        } catch (m) {
          k = "Not available", b = !0;
        }
        try {
          l = c.fileName || c.filename || c.sourceURL || ba.$googDebugFname || h;
        } catch (n) {
          l = "Not available", b = !0;
        }
        f = !b && c.lineNumber && c.fileName && c.stack && c.message && c.name ? c : {message:c.message || "Not available", name:c.name || "UnknownError", lineNumber:k, fileName:l, stack:c.stack || "Not available"};
      }
      e = "Message: " + sa(f.message) + '\nUrl: \x3ca href\x3d"view-source:' + f.fileName + '" target\x3d"_new"\x3e' + f.fileName + "\x3c/a\x3e\nLine: " + f.lineNumber + "\n\nBrowser stack:\n" + sa(f.stack + "-\x3e ") + "[end]\n\nJS stack traversal:\n" + sa(Ck(d) + "-\x3e ");
    } catch (p) {
      e = "Exception trying to expose exception! You win, we lose. " + p;
    }
    a.Nd = e;
  }
  return a;
};
var Ok = {}, Pk = null;
function Qk(a) {
  Pk || (Pk = new Ik(""), Ok[""] = Pk, Pk.be(Lk));
  var b;
  if (!(b = Ok[a])) {
    b = new Ik(a);
    var c = a.lastIndexOf("."), d = a.substr(c + 1), c = Qk(a.substr(0, c));
    c.fd || (c.fd = {});
    c.fd[d] = b;
    b.Vc = c;
    Ok[a] = b;
  }
  return b;
}
;function Rk(a, b) {
  a && a.log(Mk, b, void 0);
}
;function Sk() {
}
Sk.prototype.Fd = null;
function Tk(a) {
  var b;
  (b = a.Fd) || (b = {}, Uk(a) && (b[0] = !0, b[1] = !0), b = a.Fd = b);
  return b;
}
;var Vk;
function Wk() {
}
qa(Wk, Sk);
function Xk(a) {
  return(a = Uk(a)) ? new ActiveXObject(a) : new XMLHttpRequest;
}
function Uk(a) {
  if (!a.Sd && "undefined" == typeof XMLHttpRequest && "undefined" != typeof ActiveXObject) {
    for (var b = ["MSXML2.XMLHTTP.6.0", "MSXML2.XMLHTTP.3.0", "MSXML2.XMLHTTP", "Microsoft.XMLHTTP"], c = 0;c < b.length;c++) {
      var d = b[c];
      try {
        return new ActiveXObject(d), a.Sd = d;
      } catch (e) {
      }
    }
    throw Error("Could not create ActiveXObject. ActiveX might be disabled, or MSXML might not be installed");
  }
  return a.Sd;
}
Vk = new Wk;
var Yk = /^(?:([^:/?#.]+):)?(?:\/\/(?:([^/?#]*)@)?([^/#?]*?)(?::([0-9]+))?(?=[/#?]|$))?([^?#]+)?(?:\?([^#]*))?(?:#(.*))?$/;
function Zk(a) {
  if ($k) {
    $k = !1;
    var b = ba.location;
    if (b) {
      var c = b.href;
      if (c && (c = (c = Zk(c)[3] || null) && decodeURIComponent(c)) && c != b.hostname) {
        throw $k = !0, Error();
      }
    }
  }
  return a.match(Yk);
}
var $k = Cj;
function al(a) {
  mk.call(this);
  this.headers = new yk;
  this.dd = a || null;
  this.Nb = !1;
  this.cd = this.N = null;
  this.Td = this.Sc = "";
  this.Vb = 0;
  this.uc = "";
  this.rc = this.ud = this.Rc = this.rd = !1;
  this.ac = 0;
  this.Zc = null;
  this.$d = bl;
  this.bd = this.He = !1;
}
qa(al, mk);
var bl = "", cl = al.prototype, dl = Qk("goog.net.XhrIo");
cl.Ma = dl;
var el = /^https?$/i, fl = ["POST", "PUT"];
g = al.prototype;
g.send = function(a, b, c, d) {
  if (this.N) {
    throw Error("[goog.net.XhrIo] Object is active with another request\x3d" + this.Sc + "; newUri\x3d" + a);
  }
  b = b ? b.toUpperCase() : "GET";
  this.Sc = a;
  this.uc = "";
  this.Vb = 0;
  this.Td = b;
  this.rd = !1;
  this.Nb = !0;
  this.N = this.dd ? Xk(this.dd) : Xk(Vk);
  this.cd = this.dd ? Tk(this.dd) : Tk(Vk);
  this.N.onreadystatechange = oa(this.Vd, this);
  try {
    Rk(this.Ma, gl(this, "Opening Xhr")), this.ud = !0, this.N.open(b, String(a), !0), this.ud = !1;
  } catch (e) {
    Rk(this.Ma, gl(this, "Error opening Xhr: " + e.message));
    hl(this, e);
    return;
  }
  a = c || "";
  var f = this.headers.clone();
  d && xk(d, function(a, b) {
    f.set(b, a);
  });
  d = Ua(f.Ka());
  c = ba.FormData && a instanceof ba.FormData;
  !(0 <= Ra(fl, b)) || d || c || f.set("Content-Type", "application/x-www-form-urlencoded;charset\x3dutf-8");
  f.forEach(function(a, b) {
    this.N.setRequestHeader(b, a);
  }, this);
  this.$d && (this.N.responseType = this.$d);
  "withCredentials" in this.N && (this.N.withCredentials = this.He);
  try {
    il(this), 0 < this.ac && (this.bd = jl(this.N), Rk(this.Ma, gl(this, "Will abort after " + this.ac + "ms if incomplete, xhr2 " + this.bd)), this.bd ? (this.N.timeout = this.ac, this.N.ontimeout = oa(this.ce, this)) : this.Zc = ok(this.ce, this.ac, this)), Rk(this.Ma, gl(this, "Sending request")), this.Rc = !0, this.N.send(a), this.Rc = !1;
  } catch (h) {
    Rk(this.Ma, gl(this, "Send error: " + h.message)), hl(this, h);
  }
};
function jl(a) {
  return Aj && Gj(9) && "number" == typeof a.timeout && void 0 !== a.ontimeout;
}
function Va(a) {
  return "content-type" == a.toLowerCase();
}
g.ce = function() {
  "undefined" != typeof aa && this.N && (this.uc = "Timed out after " + this.ac + "ms, aborting", this.Vb = 8, Rk(this.Ma, gl(this, this.uc)), this.dispatchEvent("timeout"), this.abort(8));
};
function hl(a, b) {
  a.Nb = !1;
  a.N && (a.rc = !0, a.N.abort(), a.rc = !1);
  a.uc = b;
  a.Vb = 5;
  kl(a);
  ll(a);
}
function kl(a) {
  a.rd || (a.rd = !0, a.dispatchEvent("complete"), a.dispatchEvent("error"));
}
g.abort = function(a) {
  this.N && this.Nb && (Rk(this.Ma, gl(this, "Aborting")), this.Nb = !1, this.rc = !0, this.N.abort(), this.rc = !1, this.Vb = a || 7, this.dispatchEvent("complete"), this.dispatchEvent("abort"), ll(this));
};
g.Vd = function() {
  this.ye || (this.ud || this.Rc || this.rc ? ml(this) : this.De());
};
g.De = function() {
  ml(this);
};
function ml(a) {
  if (a.Nb && "undefined" != typeof aa) {
    if (a.cd[1] && 4 == nl(a) && 2 == ol(a)) {
      Rk(a.Ma, gl(a, "Local request error detected and ignored"));
    } else {
      if (a.Rc && 4 == nl(a)) {
        ok(a.Vd, 0, a);
      } else {
        if (a.dispatchEvent("readystatechange"), 4 == nl(a)) {
          Rk(a.Ma, gl(a, "Request complete"));
          a.Nb = !1;
          try {
            var b = ol(a), c, d;
            a: {
              switch(b) {
                case 200:
                ;
                case 201:
                ;
                case 202:
                ;
                case 204:
                ;
                case 206:
                ;
                case 304:
                ;
                case 1223:
                  d = !0;
                  break a;
                default:
                  d = !1;
              }
            }
            if (!(c = d)) {
              var e;
              if (e = 0 === b) {
                var f = Zk(String(a.Sc))[1] || null;
                if (!f && self.location) {
                  var h = self.location.protocol, f = h.substr(0, h.length - 1)
                }
                e = !el.test(f ? f.toLowerCase() : "");
              }
              c = e;
            }
            c ? (a.dispatchEvent("complete"), a.dispatchEvent("success")) : (a.Vb = 6, a.uc = pl(a) + " [" + ol(a) + "]", kl(a));
          } finally {
            ll(a);
          }
        }
      }
    }
  }
}
function ll(a) {
  if (a.N) {
    il(a);
    var b = a.N, c = a.cd[0] ? ea : null;
    a.N = null;
    a.cd = null;
    a.dispatchEvent("ready");
    try {
      b.onreadystatechange = c;
    } catch (d) {
      (a = a.Ma) && a.log(Kk, "Problem encountered resetting onreadystatechange: " + d.message, void 0);
    }
  }
}
function il(a) {
  a.N && a.bd && (a.N.ontimeout = null);
  "number" == typeof a.Zc && (ba.clearTimeout(a.Zc), a.Zc = null);
}
function nl(a) {
  return a.N ? a.N.readyState : 0;
}
function ol(a) {
  try {
    return 2 < nl(a) ? a.N.status : -1;
  } catch (b) {
    return-1;
  }
}
function pl(a) {
  try {
    return 2 < nl(a) ? a.N.statusText : "";
  } catch (b) {
    return Rk(a.Ma, "Can not get status: " + b.message), "";
  }
}
function ql(a) {
  try {
    return a.N ? a.N.responseText : "";
  } catch (b) {
    return Rk(a.Ma, "Can not get responseText: " + b.message), "";
  }
}
function rl(a, b) {
  if (a.N) {
    var c = a.N.responseText;
    b && 0 == c.indexOf(b) && (c = c.substring(b.length));
    return pk(c);
  }
}
g.getResponseHeader = function(a) {
  return this.N && 4 == nl(this) ? this.N.getResponseHeader(a) : void 0;
};
function gl(a, b) {
  return b + " [" + a.Td + " " + a.Sc + " " + ol(a) + "]";
}
;function sl(a, b, c) {
  this.Ja = a || null;
  this.ze = !!c;
}
function tl(a) {
  if (!a.ka && (a.ka = new yk, a.ja = 0, a.Ja)) {
    for (var b = a.Ja.split("\x26"), c = 0;c < b.length;c++) {
      var d = b[c].indexOf("\x3d"), e = null, f = null;
      0 <= d ? (e = b[c].substring(0, d), f = b[c].substring(d + 1)) : e = b[c];
      e = decodeURIComponent(e.replace(/\+/g, " "));
      e = ul(a, e);
      a.add(e, f ? decodeURIComponent(f.replace(/\+/g, " ")) : "");
    }
  }
}
g = sl.prototype;
g.ka = null;
g.ja = null;
g.Pd = function() {
  tl(this);
  return this.ja;
};
g.add = function(a, b) {
  tl(this);
  this.Ja = null;
  a = ul(this, a);
  var c = this.ka.get(a);
  c || this.ka.set(a, c = []);
  c.push(b);
  this.ja++;
  return this;
};
g.remove = function(a) {
  tl(this);
  a = ul(this, a);
  return this.ka.oc(a) ? (this.Ja = null, this.ja -= this.ka.get(a).length, this.ka.remove(a)) : !1;
};
g.clear = function() {
  this.ka = this.Ja = null;
  this.ja = 0;
};
g.oc = function(a) {
  tl(this);
  a = ul(this, a);
  return this.ka.oc(a);
};
g.Ka = function() {
  tl(this);
  for (var a = this.ka.mb(), b = this.ka.Ka(), c = [], d = 0;d < b.length;d++) {
    for (var e = a[d], f = 0;f < e.length;f++) {
      c.push(b[d]);
    }
  }
  return c;
};
g.mb = function(a) {
  tl(this);
  var b = [];
  if (ga(a)) {
    this.oc(a) && (b = Wa(b, this.ka.get(ul(this, a))));
  } else {
    a = this.ka.mb();
    for (var c = 0;c < a.length;c++) {
      b = Wa(b, a[c]);
    }
  }
  return b;
};
g.set = function(a, b) {
  tl(this);
  this.Ja = null;
  a = ul(this, a);
  this.oc(a) && (this.ja -= this.ka.get(a).length);
  this.ka.set(a, [b]);
  this.ja++;
  return this;
};
g.get = function(a, b) {
  var c = a ? this.mb(a) : [];
  return 0 < c.length ? String(c[0]) : b;
};
g.toString = function() {
  if (this.Ja) {
    return this.Ja;
  }
  if (!this.ka) {
    return "";
  }
  for (var a = [], b = this.ka.Ka(), c = 0;c < b.length;c++) {
    for (var d = b[c], e = encodeURIComponent(String(d)), d = this.mb(d), f = 0;f < d.length;f++) {
      var h = e;
      "" !== d[f] && (h += "\x3d" + encodeURIComponent(String(d[f])));
      a.push(h);
    }
  }
  return this.Ja = a.join("\x26");
};
g.clone = function() {
  var a = new sl;
  a.Ja = this.Ja;
  this.ka && (a.ka = this.ka.clone(), a.ja = this.ja);
  return a;
};
function ul(a, b) {
  var c = String(b);
  a.ze && (c = c.toLowerCase());
  return c;
}
;var vl = "undefined" != typeof Object.keys ? function(a) {
  return Object.keys(a);
} : function(a) {
  return Fa(a);
}, wl = "undefined" != typeof Array.isArray ? function(a) {
  return Array.isArray(a);
} : function(a) {
  return "array" === q(a);
};
function xl() {
  return Math.round(15 * Math.random()).toString(16);
}
;function yl(a, b) {
  if (null == a) {
    return null == b;
  }
  if (a === b) {
    return!0;
  }
  if ("object" === typeof a) {
    if (wl(a)) {
      if (wl(b) && a.length === b.length) {
        for (var c = 0;c < a.length;c++) {
          if (!yl(a[c], b[c])) {
            return!1;
          }
        }
        return!0;
      }
      return!1;
    }
    if (a.Ha) {
      return a.Ha(b);
    }
    if (null != b && "object" === typeof b) {
      if (b.Ha) {
        return b.Ha(a);
      }
      var c = 0, d = vl(b).length, e;
      for (e in a) {
        if (a.hasOwnProperty(e) && (c++, !b.hasOwnProperty(e) || !yl(a[e], b[e]))) {
          return!1;
        }
      }
      return c === d;
    }
  }
  return!1;
}
function zl(a, b) {
  return a ^ b + 2654435769 + (a << 6) + (a >> 2);
}
var Al = {}, Bl = 0;
function Cl(a) {
  var b = 0;
  if (null != a.forEach) {
    a.forEach(function(a, c) {
      b = (b + (Dl(c) ^ Dl(a))) % 4503599627370496;
    });
  } else {
    for (var c = vl(a), d = 0;d < c.length;d++) {
      var e = c[d], f = a[e], b = (b + (Dl(e) ^ Dl(f))) % 4503599627370496
    }
  }
  return b;
}
function El(a) {
  var b = 0;
  if (wl(a)) {
    for (var c = 0;c < a.length;c++) {
      b = zl(b, Dl(a[c]));
    }
  } else {
    a.forEach && a.forEach(function(a) {
      b = zl(b, Dl(a));
    });
  }
  return b;
}
function Dl(a) {
  if (null == a) {
    return 0;
  }
  switch(typeof a) {
    case "number":
      return a;
    case "boolean":
      return!0 === a ? 1 : 0;
    case "string":
      var b = Al[a];
      if (null == b) {
        for (var c = b = 0;c < a.length;++c) {
          b = 31 * b + a.charCodeAt(c), b %= 4294967296;
        }
        Bl++;
        256 <= Bl && (Al = {}, Bl = 1);
        Al[a] = b;
      }
      a = b;
      return a;
    default:
      return a instanceof Date ? a.valueOf() : wl(a) ? El(a) : a.Pa ? a.Pa() : Cl(a);
  }
}
;function Fl(a, b) {
  this.da = a | 0;
  this.S = b | 0;
}
var Gl = {};
function Hl(a) {
  if (-128 <= a && 128 > a) {
    var b = Gl[a];
    if (b) {
      return b;
    }
  }
  b = new Fl(a | 0, 0 > a ? -1 : 0);
  -128 <= a && 128 > a && (Gl[a] = b);
  return b;
}
function Il(a) {
  return isNaN(a) || !isFinite(a) ? Jl : a <= -Kl ? Ll : a + 1 >= Kl ? Ml : 0 > a ? Nl(Il(-a)) : new Fl(a % Ol | 0, a / Ol | 0);
}
function Pl(a, b) {
  return new Fl(a, b);
}
function Ql(a, b) {
  if (0 == a.length) {
    throw Error("number format error: empty string");
  }
  var c = b || 10;
  if (2 > c || 36 < c) {
    throw Error("radix out of range: " + c);
  }
  if ("-" == a.charAt(0)) {
    return Nl(Ql(a.substring(1), c));
  }
  if (0 <= a.indexOf("-")) {
    throw Error('number format error: interior "-" character: ' + a);
  }
  for (var d = Il(Math.pow(c, 8)), e = Jl, f = 0;f < a.length;f += 8) {
    var h = Math.min(8, a.length - f), k = parseInt(a.substring(f, f + h), c);
    8 > h ? (h = Il(Math.pow(c, h)), e = e.multiply(h).add(Il(k))) : (e = e.multiply(d), e = e.add(Il(k)));
  }
  return e;
}
var Ol = 4294967296, Kl = Ol * Ol / 2, Jl = Hl(0), Rl = Hl(1), Sl = Hl(-1), Ml = Pl(-1, 2147483647), Ll = Pl(0, -2147483648), Tl = Hl(16777216);
function Ul(a) {
  return a.S * Ol + (0 <= a.da ? a.da : Ol + a.da);
}
g = Fl.prototype;
g.toString = function(a) {
  a = a || 10;
  if (2 > a || 36 < a) {
    throw Error("radix out of range: " + a);
  }
  if (Vl(this)) {
    return "0";
  }
  if (0 > this.S) {
    if (this.ya(Ll)) {
      var b = Il(a), c = Wl(this, b), b = Xl(c.multiply(b), this);
      return c.toString(a) + b.da.toString(a);
    }
    return "-" + Nl(this).toString(a);
  }
  for (var c = Il(Math.pow(a, 6)), b = this, d = "";;) {
    var e = Wl(b, c), f = Xl(b, e.multiply(c)).da.toString(a), b = e;
    if (Vl(b)) {
      return f + d;
    }
    for (;6 > f.length;) {
      f = "0" + f;
    }
    d = "" + f + d;
  }
};
function Vl(a) {
  return 0 == a.S && 0 == a.da;
}
g.ya = function(a) {
  return this.S == a.S && this.da == a.da;
};
g.compare = function(a) {
  if (this.ya(a)) {
    return 0;
  }
  var b = 0 > this.S, c = 0 > a.S;
  return b && !c ? -1 : !b && c ? 1 : 0 > Xl(this, a).S ? -1 : 1;
};
function Nl(a) {
  return a.ya(Ll) ? Ll : Pl(~a.da, ~a.S).add(Rl);
}
g.add = function(a) {
  var b = this.S >>> 16, c = this.S & 65535, d = this.da >>> 16, e = a.S >>> 16, f = a.S & 65535, h = a.da >>> 16, k;
  k = 0 + ((this.da & 65535) + (a.da & 65535));
  a = 0 + (k >>> 16);
  a += d + h;
  d = 0 + (a >>> 16);
  d += c + f;
  c = 0 + (d >>> 16);
  c = c + (b + e) & 65535;
  return Pl((a & 65535) << 16 | k & 65535, c << 16 | d & 65535);
};
function Xl(a, b) {
  return a.add(Nl(b));
}
g.multiply = function(a) {
  if (Vl(this) || Vl(a)) {
    return Jl;
  }
  if (this.ya(Ll)) {
    return 1 == (a.da & 1) ? Ll : Jl;
  }
  if (a.ya(Ll)) {
    return 1 == (this.da & 1) ? Ll : Jl;
  }
  if (0 > this.S) {
    return 0 > a.S ? Nl(this).multiply(Nl(a)) : Nl(Nl(this).multiply(a));
  }
  if (0 > a.S) {
    return Nl(this.multiply(Nl(a)));
  }
  if (0 > this.compare(Tl) && 0 > a.compare(Tl)) {
    return Il(Ul(this) * Ul(a));
  }
  var b = this.S >>> 16, c = this.S & 65535, d = this.da >>> 16, e = this.da & 65535, f = a.S >>> 16, h = a.S & 65535, k = a.da >>> 16;
  a = a.da & 65535;
  var l, m, n, p;
  p = 0 + e * a;
  n = 0 + (p >>> 16);
  n += d * a;
  m = 0 + (n >>> 16);
  n = (n & 65535) + e * k;
  m += n >>> 16;
  n &= 65535;
  m += c * a;
  l = 0 + (m >>> 16);
  m = (m & 65535) + d * k;
  l += m >>> 16;
  m &= 65535;
  m += e * h;
  l += m >>> 16;
  m &= 65535;
  l = l + (b * a + c * k + d * h + e * f) & 65535;
  return Pl(n << 16 | p & 65535, l << 16 | m);
};
function Wl(a, b) {
  if (Vl(b)) {
    throw Error("division by zero");
  }
  if (Vl(a)) {
    return Jl;
  }
  if (a.ya(Ll)) {
    if (b.ya(Rl) || b.ya(Sl)) {
      return Ll;
    }
    if (b.ya(Ll)) {
      return Rl;
    }
    var c;
    c = 1;
    if (0 == c) {
      c = a;
    } else {
      var d = a.S;
      c = 32 > c ? Pl(a.da >>> c | d << 32 - c, d >> c) : Pl(d >> c - 32, 0 <= d ? 0 : -1);
    }
    c = Wl(c, b).shiftLeft(1);
    if (c.ya(Jl)) {
      return 0 > b.S ? Rl : Sl;
    }
    d = Xl(a, b.multiply(c));
    return c.add(Wl(d, b));
  }
  if (b.ya(Ll)) {
    return Jl;
  }
  if (0 > a.S) {
    return 0 > b.S ? Wl(Nl(a), Nl(b)) : Nl(Wl(Nl(a), b));
  }
  if (0 > b.S) {
    return Nl(Wl(a, Nl(b)));
  }
  for (var e = Jl, d = a;0 <= d.compare(b);) {
    c = Math.max(1, Math.floor(Ul(d) / Ul(b)));
    for (var f = Math.ceil(Math.log(c) / Math.LN2), f = 48 >= f ? 1 : Math.pow(2, f - 48), h = Il(c), k = h.multiply(b);0 > k.S || 0 < k.compare(d);) {
      c -= f, h = Il(c), k = h.multiply(b);
    }
    Vl(h) && (h = Rl);
    e = e.add(h);
    d = Xl(d, k);
  }
  return e;
}
g.shiftLeft = function(a) {
  a &= 63;
  if (0 == a) {
    return this;
  }
  var b = this.da;
  return 32 > a ? Pl(b << a, this.S << a | b >>> 32 - a) : Pl(0, b << a - 32);
};
function Yl(a, b) {
  b &= 63;
  if (0 == b) {
    return a;
  }
  var c = a.S;
  return 32 > b ? Pl(a.da >>> b | c << 32 - b, c >>> b) : 32 == b ? Pl(c, 0) : Pl(c >>> b - 32, 0);
}
;function $l(a, b) {
  this.tag = a;
  this.M = b;
  this.U = -1;
}
$l.prototype.toString = function() {
  return "[TaggedValue: " + this.tag + ", " + this.M + "]";
};
$l.prototype.equiv = function(a) {
  return yl(this, a);
};
$l.prototype.equiv = $l.prototype.equiv;
$l.prototype.Ha = function(a) {
  return a instanceof $l ? this.tag === a.tag && yl(this.M, a.M) : !1;
};
$l.prototype.Pa = function() {
  -1 === this.U && (this.U = zl(Dl(this.tag), Dl(this.M)));
  return this.U;
};
function am(a, b) {
  return new $l(a, b);
}
var bm = Ql("9007199254740992"), cm = Ql("-9007199254740992");
Fl.prototype.equiv = function(a) {
  return yl(this, a);
};
Fl.prototype.equiv = Fl.prototype.equiv;
Fl.prototype.Ha = function(a) {
  return a instanceof Fl && this.ya(a);
};
Fl.prototype.Pa = function() {
  return this.da;
};
function dm(a) {
  this.name = a;
  this.U = -1;
}
dm.prototype.toString = function() {
  return ":" + this.name;
};
dm.prototype.equiv = function(a) {
  return yl(this, a);
};
dm.prototype.equiv = dm.prototype.equiv;
dm.prototype.Ha = function(a) {
  return a instanceof dm && this.name == a.name;
};
dm.prototype.Pa = function() {
  -1 === this.U && (this.U = Dl(this.name));
  return this.U;
};
function em(a) {
  this.name = a;
  this.U = -1;
}
em.prototype.toString = function() {
  return "[Symbol: " + this.name + "]";
};
em.prototype.equiv = function(a) {
  return yl(this, a);
};
em.prototype.equiv = em.prototype.equiv;
em.prototype.Ha = function(a) {
  return a instanceof em && this.name == a.name;
};
em.prototype.Pa = function() {
  -1 === this.U && (this.U = Dl(this.name));
  return this.U;
};
function fm(a, b, c) {
  var d = "";
  c = c || b + 1;
  for (var e = 8 * (7 - b), f = Hl(255).shiftLeft(e);b < c;b++, e -= 8, f = Yl(f, 8)) {
    var h = Yl(Pl(a.da & f.da, a.S & f.S), e).toString(16);
    1 == h.length && (h = "0" + h);
    d += h;
  }
  return d;
}
function gm(a, b) {
  this.td = a;
  this.vd = b;
  this.U = -1;
}
gm.prototype.toString = function(a) {
  var b = this.td, c = this.vd;
  a = "" + (fm(b, 0, 4) + "-");
  a += fm(b, 4, 6) + "-";
  a += fm(b, 6, 8) + "-";
  a += fm(c, 0, 2) + "-";
  return a += fm(c, 2, 8);
};
gm.prototype.equiv = function(a) {
  return yl(this, a);
};
gm.prototype.equiv = gm.prototype.equiv;
gm.prototype.Ha = function(a) {
  return a instanceof gm && this.td.ya(a.td) && this.vd.ya(a.vd);
};
gm.prototype.Pa = function() {
  -1 === this.U && (this.U = Dl(this.toString()));
  return this.U;
};
Date.prototype.Ha = function(a) {
  return a instanceof Date ? this.valueOf() === a.valueOf() : !1;
};
Date.prototype.Pa = function() {
  return this.valueOf();
};
function hm(a, b) {
  this.entries = a;
  this.type = b || 0;
  this.O = 0;
}
hm.prototype.next = function() {
  if (this.O < this.entries.length) {
    var a = null, a = 0 === this.type ? this.entries[this.O] : 1 === this.type ? this.entries[this.O + 1] : [this.entries[this.O], this.entries[this.O + 1]], a = {value:a, done:!1};
    this.O += 2;
    return a;
  }
  return{value:null, done:!0};
};
hm.prototype.next = hm.prototype.next;
function im(a, b) {
  this.map = a;
  this.type = b || 0;
  this.keys = this.map.Ka();
  this.O = 0;
  this.zb = null;
  this.qb = 0;
}
im.prototype.next = function() {
  if (this.O < this.map.size) {
    null != this.zb && this.qb < this.zb.length || (this.zb = this.map.map[this.keys[this.O]], this.qb = 0);
    var a = null, a = 0 === this.type ? this.zb[this.qb] : 1 === this.type ? this.zb[this.qb + 1] : [this.zb[this.qb], this.zb[this.qb + 1]], a = {value:a, done:!1};
    this.O++;
    this.qb += 2;
    return a;
  }
  return{value:null, done:!0};
};
im.prototype.next = im.prototype.next;
function jm(a, b) {
  if ((b instanceof Z || b instanceof $) && a.size === b.size) {
    for (var c in a.map) {
      for (var d = a.map[c], e = 0;e < d.length;e += 2) {
        if (!yl(d[e + 1], b.get(d[e]))) {
          return!1;
        }
      }
    }
    return!0;
  }
  if (null != b && "object" === typeof b && (c = vl(b), d = c.length, a.size === d)) {
    for (e = 0;e < d;e++) {
      var f = c[e];
      if (!a.has(f) || !yl(b[f], a.get(f))) {
        return!1;
      }
    }
    return!0;
  }
  return!1;
}
function $(a) {
  this.Z = a;
  this.P = null;
  this.U = -1;
  this.size = a.length / 2;
  this.Ad = 0;
}
$.prototype.toString = function() {
  return "[TransitArrayMap]";
};
function km(a) {
  if (a.P) {
    throw Error("Invalid operation, already converted");
  }
  if (8 > a.size) {
    return!1;
  }
  a.Ad++;
  return 32 < a.Ad ? (a.P = lm(a.Z, !0), a.Z = [], !0) : !1;
}
$.prototype.clear = function() {
  this.U = -1;
  this.P ? this.P.clear() : this.Z = [];
  this.size = 0;
};
$.prototype.clear = $.prototype.clear;
$.prototype.keys = function() {
  return this.P ? this.P.keys() : new hm(this.Z, 0);
};
$.prototype.keys = $.prototype.keys;
$.prototype.Gb = function() {
  if (this.P) {
    return this.P.Gb();
  }
  for (var a = [], b = 0, c = 0;c < this.Z.length;b++, c += 2) {
    a[b] = this.Z[c];
  }
  return a;
};
$.prototype.keySet = $.prototype.Gb;
$.prototype.entries = function() {
  return this.P ? this.P.entries() : new hm(this.Z, 2);
};
$.prototype.entries = $.prototype.entries;
$.prototype.values = function() {
  return this.P ? this.P.values() : new hm(this.Z, 1);
};
$.prototype.values = $.prototype.values;
$.prototype.forEach = function(a) {
  if (this.P) {
    this.P.forEach(a);
  } else {
    for (var b = 0;b < this.Z.length;b += 2) {
      a(this.Z[b + 1], this.Z[b]);
    }
  }
};
$.prototype.forEach = $.prototype.forEach;
$.prototype.get = function(a, b) {
  if (this.P) {
    return this.P.get(a);
  }
  if (km(this)) {
    return this.get(a);
  }
  for (var c = 0;c < this.Z.length;c += 2) {
    if (yl(this.Z[c], a)) {
      return this.Z[c + 1];
    }
  }
  return b;
};
$.prototype.get = $.prototype.get;
$.prototype.has = function(a) {
  if (this.P) {
    return this.P.has(a);
  }
  if (km(this)) {
    return this.has(a);
  }
  for (var b = 0;b < this.Z.length;b += 2) {
    if (yl(this.Z[b], a)) {
      return!0;
    }
  }
  return!1;
};
$.prototype.has = $.prototype.has;
$.prototype.set = function(a, b) {
  this.U = -1;
  if (this.P) {
    this.P.set(a, b), this.size = this.P.size;
  } else {
    for (var c = 0;c < this.Z.length;c += 2) {
      if (yl(this.Z[c], a)) {
        this.Z[c + 1] = b;
        return;
      }
    }
    this.Z.push(a);
    this.Z.push(b);
    this.size++;
    32 < this.size && (this.P = lm(this.Z, !0), this.Z = null);
  }
};
$.prototype.set = $.prototype.set;
$.prototype["delete"] = function(a) {
  this.U = -1;
  if (this.P) {
    this.P["delete"](a), this.size = this.P.size;
  } else {
    for (var b = 0;b < this.Z.length;b += 2) {
      if (yl(this.Z[b], a)) {
        this.Z.splice(b, 2);
        this.size--;
        break;
      }
    }
  }
};
$.prototype.Pa = function() {
  if (this.P) {
    return this.P.Pa();
  }
  -1 === this.U && (this.U = Cl(this));
  return this.U;
};
$.prototype.Ha = function(a) {
  return this.P ? jm(this.P, a) : jm(this, a);
};
function Z(a, b, c) {
  this.map = b || {};
  this.Mb = a || [];
  this.size = c || 0;
  this.U = -1;
}
Z.prototype.toString = function() {
  return "[TransitMap]";
};
Z.prototype.clear = function() {
  this.U = -1;
  this.map = {};
  this.Mb = [];
  this.size = 0;
};
Z.prototype.clear = Z.prototype.clear;
Z.prototype.Ka = function() {
  return null != this.Mb ? this.Mb : vl(this.map);
};
Z.prototype["delete"] = function(a) {
  this.U = -1;
  this.Mb = null;
  for (var b = Dl(a), c = this.map[b], d = 0;d < c.length;d += 2) {
    if (yl(a, c[d])) {
      c.splice(d, 2);
      0 === c.length && delete this.map[b];
      this.size--;
      break;
    }
  }
};
Z.prototype.entries = function() {
  return new im(this, 2);
};
Z.prototype.entries = Z.prototype.entries;
Z.prototype.forEach = function(a) {
  for (var b = this.Ka(), c = 0;c < b.length;c++) {
    for (var d = this.map[b[c]], e = 0;e < d.length;e += 2) {
      a(d[e + 1], d[e], this);
    }
  }
};
Z.prototype.forEach = Z.prototype.forEach;
Z.prototype.get = function(a, b) {
  var c = Dl(a), c = this.map[c];
  if (null != c) {
    for (var d = 0;d < c.length;d += 2) {
      if (yl(a, c[d])) {
        return c[d + 1];
      }
    }
  } else {
    return b;
  }
};
Z.prototype.get = Z.prototype.get;
Z.prototype.has = function(a) {
  var b = Dl(a), b = this.map[b];
  if (null != b) {
    for (var c = 0;c < b.length;c += 2) {
      if (yl(a, b[c])) {
        return!0;
      }
    }
  }
  return!1;
};
Z.prototype.has = Z.prototype.has;
Z.prototype.keys = function() {
  return new im(this, 0);
};
Z.prototype.keys = Z.prototype.keys;
Z.prototype.Gb = function() {
  for (var a = this.Ka(), b = [], c = 0;c < a.length;c++) {
    for (var d = this.map[a[c]], e = 0;e < d.length;e += 2) {
      b.push(d[e]);
    }
  }
  return b;
};
Z.prototype.keySet = Z.prototype.Gb;
Z.prototype.set = function(a, b) {
  this.U = -1;
  var c = Dl(a), d = this.map[c];
  if (null == d) {
    this.Mb && this.Mb.push(c), this.map[c] = [a, b], this.size++;
  } else {
    for (var c = !0, e = 0;e < d.length;e += 2) {
      if (yl(b, d[e])) {
        c = !1;
        d[e] = b;
        break;
      }
    }
    c && (d.push(a), d.push(b), this.size++);
  }
};
Z.prototype.set = Z.prototype.set;
Z.prototype.values = function() {
  return new im(this, 1);
};
Z.prototype.values = Z.prototype.values;
Z.prototype.Pa = function() {
  -1 === this.U && (this.U = Cl(this));
  return this.U;
};
Z.prototype.Ha = function(a) {
  return jm(this, a);
};
function lm(a, b) {
  var c = !1;
  a = a || [];
  c = !1 === c ? c : !0;
  if ((!0 !== b || !b) && 64 >= a.length) {
    if (c) {
      var d = a;
      a = [];
      for (c = 0;c < d.length;c += 2) {
        for (var e = !1, f = 0;f < a.length;f += 2) {
          if (yl(a[f], d[c])) {
            a[f + 1] = d[c + 1];
            e = !0;
            break;
          }
        }
        e || (a.push(d[c]), a.push(d[c + 1]));
      }
    }
    return new $(a);
  }
  for (var d = {}, e = [], h = 0, c = 0;c < a.length;c += 2) {
    var f = Dl(a[c]), k = d[f];
    if (null == k) {
      e.push(f), d[f] = [a[c], a[c + 1]], h++;
    } else {
      for (var l = !0, f = 0;f < k.length;f += 2) {
        if (yl(k[f], a[c])) {
          k[f + 1] = a[c + 1];
          l = !1;
          break;
        }
      }
      l && (k.push(a[c]), k.push(a[c + 1]), h++);
    }
  }
  return new Z(e, d, h);
}
function mm(a) {
  this.map = a;
  this.size = a.size;
}
mm.prototype.toString = function() {
  return "[TransitSet]";
};
mm.prototype.add = function(a) {
  this.map.set(a, a);
  this.size = this.map.size;
};
mm.prototype.add = mm.prototype.add;
mm.prototype.clear = function() {
  this.map = new Z;
  this.size = 0;
};
mm.prototype.clear = mm.prototype.clear;
mm.prototype["delete"] = function(a) {
  this.map["delete"](a);
  this.size = this.map.size;
};
mm.prototype.entries = function() {
  return this.map.entries();
};
mm.prototype.entries = mm.prototype.entries;
mm.prototype.forEach = function(a) {
  var b = this;
  this.map.forEach(function(c, d) {
    a(d, b);
  });
};
mm.prototype.forEach = mm.prototype.forEach;
mm.prototype.has = function(a) {
  return this.map.has(a);
};
mm.prototype.has = mm.prototype.has;
mm.prototype.keys = function() {
  return this.map.keys();
};
mm.prototype.keys = mm.prototype.keys;
mm.prototype.Gb = function() {
  return this.map.Gb();
};
mm.prototype.keySet = mm.prototype.Gb;
mm.prototype.values = function() {
  return this.map.values();
};
mm.prototype.values = mm.prototype.values;
mm.prototype.Ha = function(a) {
  if (a instanceof mm) {
    if (this.size === a.size) {
      return yl(this.map, a.map);
    }
  } else {
    return!1;
  }
};
mm.prototype.Pa = function() {
  return Dl(this.map);
};
function nm(a, b) {
  if (3 < a.length) {
    if (b) {
      return!0;
    }
    var c = a.charAt(1);
    return "~" === a.charAt(0) ? ":" === c || "$" === c || "#" === c : !1;
  }
  return!1;
}
function om(a) {
  var b = Math.floor(a / 44);
  a = String.fromCharCode(a % 44 + 48);
  return 0 === b ? "^" + a : "^" + String.fromCharCode(b + 48) + a;
}
function pm() {
  this.ge = this.qc = this.O = 0;
  this.Ca = {};
}
pm.prototype.write = function(a, b) {
  if (nm(a, b)) {
    4096 === this.ge ? (this.clear(), this.qc = 0, this.Ca = {}) : 1936 === this.O && this.clear();
    var c = this.Ca[a];
    return null == c ? (this.Ca[a] = [om(this.O), this.qc], this.O++, a) : c[1] != this.qc ? (c[1] = this.qc, c[0] = om(this.O), this.O++, a) : c[0];
  }
  return a;
};
pm.prototype.clear = function() {
  this.O = 0;
  this.qc++;
};
function qm() {
  this.O = 0;
  this.Ca = [];
}
qm.prototype.write = function(a) {
  1936 == this.O && (this.O = 0);
  this.Ca[this.O] = a;
  this.O++;
  return a;
};
qm.prototype.Zb = function(a) {
  return this.Ca[2 === a.length ? a.charCodeAt(1) - 48 : 44 * (a.charCodeAt(1) - 48) + (a.charCodeAt(2) - 48)];
};
qm.prototype.clear = function() {
  this.O = 0;
};
function rm(a) {
  this.Ba = a;
}
function sm(a) {
  this.options = a || {};
  this.na = {};
  for (var b in this.Oc.na) {
    this.na[b] = this.Oc.na[b];
  }
  for (b in this.options.handlers) {
    a: {
      switch(b) {
        case "_":
        ;
        case "s":
        ;
        case "?":
        ;
        case "i":
        ;
        case "d":
        ;
        case "b":
        ;
        case "'":
        ;
        case "array":
        ;
        case "map":
          a = !0;
          break a;
      }
      a = !1;
    }
    if (a) {
      throw Error('Cannot override handler for ground type "' + b + '"');
    }
    this.na[b] = this.options.handlers[b];
  }
  this.Wc = null != this.options.preferStrings ? this.options.preferStrings : this.Oc.Wc;
  this.qd = this.options.defaultHandler || this.Oc.qd;
  this.Na = this.options.mapBuilder;
  this.Ob = this.options.arrayBuilder;
}
sm.prototype.Oc = {na:{_:function() {
  return null;
}, "?":function(a) {
  return "t" === a;
}, b:function(a) {
  return am("b", a);
}, i:function(a) {
  "number" === typeof a || a instanceof Fl || (a = Ql(a, 10), a = 0 < a.compare(bm) || 0 > a.compare(cm) ? a : Ul(a));
  return a;
}, n:function(a) {
  return am("n", a);
}, d:function(a) {
  return parseFloat(a);
}, f:function(a) {
  return am("f", a);
}, c:function(a) {
  return a;
}, ":":function(a) {
  return new dm(a);
}, $:function(a) {
  return new em(a);
}, r:function(a) {
  return am("r", a);
}, z:function(a) {
  a: {
    switch(a) {
      case "-INF":
        a = -Infinity;
        break a;
      case "INF":
        a = Infinity;
        break a;
      case "NaN":
        a = NaN;
        break a;
      default:
        throw Error("Invalid special double value " + a);;
    }
  }
  return a;
}, "'":function(a) {
  return a;
}, m:function(a) {
  a = "number" === typeof a ? a : parseInt(a, 10);
  return new Date(a);
}, t:function(a) {
  return new Date(a);
}, u:function(a) {
  a = a.replace(/-/g, "");
  for (var b = null, c = null, d = c = 0, e = 24, f = 0, f = c = 0, e = 24;8 > f;f += 2, e -= 8) {
    c |= parseInt(a.substring(f, f + 2), 16) << e;
  }
  d = 0;
  f = 8;
  for (e = 24;16 > f;f += 2, e -= 8) {
    d |= parseInt(a.substring(f, f + 2), 16) << e;
  }
  b = Pl(d, c);
  c = 0;
  f = 16;
  for (e = 24;24 > f;f += 2, e -= 8) {
    c |= parseInt(a.substring(f, f + 2), 16) << e;
  }
  d = 0;
  for (e = f = 24;32 > f;f += 2, e -= 8) {
    d |= parseInt(a.substring(f, f + 2), 16) << e;
  }
  c = Pl(d, c);
  return new gm(b, c);
}, set:function(a) {
  a = a || [];
  for (var b = {}, c = [], d = 0, e = 0;e < a.length;e++) {
    var f = Dl(a[e]), h = b[f];
    if (null == h) {
      c.push(f), b[f] = [a[e], a[e]], d++;
    } else {
      for (var f = !0, k = 0;k < h.length;k += 2) {
        if (yl(h[k], a[e])) {
          f = !1;
          break;
        }
      }
      f && (h.push(a[e]), h.push(a[e]), d++);
    }
  }
  return new mm(new Z(c, b, d));
}, list:function(a) {
  return am("list", a);
}, link:function(a) {
  return am("link", a);
}, cmap:function(a) {
  return lm(a);
}}, qd:function(a, b) {
  return am(a, b);
}, Wc:!0};
sm.prototype.ea = function(a, b, c, d) {
  if (null == a) {
    return null;
  }
  switch(typeof a) {
    case "string":
      return nm(a, c) ? (a = tm(this, a), b && b.write(a, c), b = a) : b = "^" === a.charAt(0) && " " !== a.charAt(1) ? b.Zb(a, c) : tm(this, a), b;
    case "object":
      if (wl(a)) {
        if ("^ " === a[0]) {
          if (this.Na) {
            if (17 > a.length && this.Na.Eb) {
              d = [];
              for (c = 1;c < a.length;c += 2) {
                d.push(this.ea(a[c], b, !0, !1)), d.push(this.ea(a[c + 1], b, !1, !1));
              }
              b = this.Na.Eb(d, a);
            } else {
              d = this.Na.Ub(a);
              for (c = 1;c < a.length;c += 2) {
                d = this.Na.add(d, this.ea(a[c], b, !0, !1), this.ea(a[c + 1], b, !1, !1), a);
              }
              b = this.Na.Pc(d, a);
            }
          } else {
            d = [];
            for (c = 1;c < a.length;c += 2) {
              d.push(this.ea(a[c], b, !0, !1)), d.push(this.ea(a[c + 1], b, !1, !1));
            }
            b = lm(d);
          }
        } else {
          b = um(this, a, b, d);
        }
      } else {
        c = vl(a);
        var e = c[0];
        if ((d = 1 == c.length ? this.ea(e, b, !1, !1) : null) && d instanceof rm) {
          a = a[e], c = this.na[d.Ba], b = null != c ? c(this.ea(a, b, !1, !0)) : am(d.Ba, this.ea(a, b, !1, !1));
        } else {
          if (this.Na) {
            if (16 > c.length && this.Na.Eb) {
              var f = [];
              for (d = 0;d < c.length;d++) {
                e = c[d], f.push(this.ea(e, b, !0, !1)), f.push(this.ea(a[e], b, !1, !1));
              }
              b = this.Na.Eb(f, a);
            } else {
              f = this.Na.Ub(a);
              for (d = 0;d < c.length;d++) {
                e = c[d], f = this.Na.add(f, this.ea(e, b, !0, !1), this.ea(a[e], b, !1, !1), a);
              }
              b = this.Na.Pc(f, a);
            }
          } else {
            f = [];
            for (d = 0;d < c.length;d++) {
              e = c[d], f.push(this.ea(e, b, !0, !1)), f.push(this.ea(a[e], b, !1, !1));
            }
            b = lm(f);
          }
        }
      }
      return b;
  }
  return a;
};
sm.prototype.decode = sm.prototype.ea;
function um(a, b, c, d) {
  if (d) {
    var e = [];
    for (d = 0;d < b.length;d++) {
      e.push(a.ea(b[d], c, !1, !1));
    }
    return e;
  }
  e = c && c.O;
  if (2 === b.length && "string" === typeof b[0] && (d = a.ea(b[0], c, !1, !1)) && d instanceof rm) {
    return b = b[1], e = a.na[d.Ba], null != e ? e = e(a.ea(b, c, !1, !0)) : am(d.Ba, a.ea(b, c, !1, !1));
  }
  c && e != c.O && (c.O = e);
  if (a.Ob) {
    if (32 >= b.length && a.Ob.Eb) {
      e = [];
      for (d = 0;d < b.length;d++) {
        e.push(a.ea(b[d], c, !1, !1));
      }
      return a.Ob.Eb(e, b);
    }
    e = a.Ob.Ub();
    for (d = 0;d < b.length;d++) {
      e = a.Ob.add(e, a.ea(b[d], c, !1, !1), b);
    }
    return a.Ob.Pc(e, b);
  }
  e = [];
  for (d = 0;d < b.length;d++) {
    e.push(a.ea(b[d], c, !1, !1));
  }
  return e;
}
function tm(a, b) {
  if ("~" === b.charAt(0)) {
    var c = b.charAt(1);
    if ("~" === c || "^" === c || "`" === c) {
      return b.substring(1);
    }
    if ("#" === c) {
      return new rm(b.substring(2));
    }
    var d = a.na[c];
    return null == d ? a.qd(c, b.substring(2)) : d(b.substring(2));
  }
  return b;
}
;function vm(a) {
  this.xe = new sm(a);
}
function wm(a, b) {
  this.Ge = a;
  this.options = b || {};
  this.Ca = this.options.cache ? this.options.cache : new qm;
}
wm.prototype.Zb = function(a) {
  var b = this.Ca;
  a = this.Ge.xe.ea(JSON.parse(a), b);
  this.Ca.clear();
  return a;
};
wm.prototype.read = wm.prototype.Zb;
var xm = 0, ym = (8 | 3 & Math.round(14 * Math.random())).toString(16), zm = "transit$guid$" + (xl() + xl() + xl() + xl() + xl() + xl() + xl() + xl() + "-" + xl() + xl() + xl() + xl() + "-4" + xl() + xl() + xl() + "-" + ym + xl() + xl() + xl() + "-" + xl() + xl() + xl() + xl() + xl() + xl() + xl() + xl() + xl() + xl() + xl() + xl());
function Am(a) {
  if (null == a) {
    return "null";
  }
  if (a === String) {
    return "string";
  }
  if (a === Boolean) {
    return "boolean";
  }
  if (a === Number) {
    return "number";
  }
  if (a === Array) {
    return "array";
  }
  if (a === Object) {
    return "map";
  }
  var b = a[zm];
  null == b && ("undefined" != typeof Object.defineProperty ? (b = ++xm, Object.defineProperty(a, zm, {value:b, enumerable:!1})) : a[zm] = b = ++xm);
  return b;
}
function Bm(a, b) {
  for (var c = a.toString(), d = c.length;d < b;d++) {
    c = "0" + c;
  }
  return c;
}
function Cm() {
}
Cm.prototype.tag = function() {
  return "_";
};
Cm.prototype.M = function() {
  return null;
};
Cm.prototype.fa = function() {
  return "null";
};
function Dm() {
}
Dm.prototype.tag = function() {
  return "s";
};
Dm.prototype.M = function(a) {
  return a;
};
Dm.prototype.fa = function(a) {
  return a;
};
function Em() {
}
Em.prototype.tag = function() {
  return "i";
};
Em.prototype.M = function(a) {
  return a;
};
Em.prototype.fa = function(a) {
  return a.toString();
};
function Fm() {
}
Fm.prototype.tag = function() {
  return "i";
};
Fm.prototype.M = function(a) {
  return a.toString();
};
Fm.prototype.fa = function(a) {
  return a.toString();
};
function Gm() {
}
Gm.prototype.tag = function() {
  return "?";
};
Gm.prototype.M = function(a) {
  return a;
};
Gm.prototype.fa = function(a) {
  return a.toString();
};
function Hm() {
}
Hm.prototype.tag = function() {
  return "array";
};
Hm.prototype.M = function(a) {
  return a;
};
Hm.prototype.fa = function() {
  return null;
};
function Im() {
}
Im.prototype.tag = function() {
  return "map";
};
Im.prototype.M = function(a) {
  return a;
};
Im.prototype.fa = function() {
  return null;
};
function Jm() {
}
Jm.prototype.tag = function() {
  return "t";
};
Jm.prototype.M = function(a) {
  return a.getUTCFullYear() + "-" + Bm(a.getUTCMonth() + 1, 2) + "-" + Bm(a.getUTCDate(), 2) + "T" + Bm(a.getUTCHours(), 2) + ":" + Bm(a.getUTCMinutes(), 2) + ":" + Bm(a.getUTCSeconds(), 2) + "." + Bm(a.getUTCMilliseconds(), 3) + "Z";
};
Jm.prototype.fa = function(a, b) {
  return b.M(a);
};
function Km() {
}
Km.prototype.tag = function() {
  return "m";
};
Km.prototype.M = function(a) {
  return a.valueOf();
};
Km.prototype.fa = function(a) {
  return a.valueOf().toString();
};
function Lm() {
}
Lm.prototype.tag = function() {
  return "u";
};
Lm.prototype.M = function(a) {
  return a.toString();
};
Lm.prototype.fa = function(a) {
  return a.toString();
};
function Mm() {
}
Mm.prototype.tag = function() {
  return ":";
};
Mm.prototype.M = function(a) {
  return a.name;
};
Mm.prototype.fa = function(a, b) {
  return b.M(a);
};
function Nm() {
}
Nm.prototype.tag = function() {
  return "$";
};
Nm.prototype.M = function(a) {
  return a.name;
};
Nm.prototype.fa = function(a, b) {
  return b.M(a);
};
function Om() {
}
Om.prototype.tag = function(a) {
  return a.tag;
};
Om.prototype.M = function(a) {
  return a.M;
};
Om.prototype.fa = function() {
  return null;
};
function Pm() {
}
Pm.prototype.tag = function() {
  return "set";
};
Pm.prototype.M = function(a) {
  var b = [];
  a.forEach(function(a) {
    b.push(a);
  });
  return am("array", b);
};
Pm.prototype.fa = function() {
  return null;
};
function Qm() {
}
Qm.prototype.tag = function() {
  return "map";
};
Qm.prototype.M = function(a) {
  return a;
};
Qm.prototype.fa = function() {
  return null;
};
function Rm() {
}
Rm.prototype.tag = function() {
  return "map";
};
Rm.prototype.M = function(a) {
  return a;
};
Rm.prototype.fa = function() {
  return null;
};
function Sm() {
  this.na = {};
  this.set(null, new Cm);
  this.set(String, new Dm);
  this.set(Number, new Em);
  this.set(Fl, new Fm);
  this.set(Boolean, new Gm);
  this.set(Array, new Hm);
  this.set(Object, new Im);
  this.set(Date, new Km);
  this.set(gm, new Lm);
  this.set(dm, new Mm);
  this.set(em, new Nm);
  this.set($l, new Om);
  this.set(mm, new Pm);
  this.set($, new Qm);
  this.set(Z, new Rm);
}
Sm.prototype.get = function(a) {
  var b = null, b = "string" === typeof a ? this.na[a] : this.na[Am(a)];
  return null != b ? b : this.na["default"];
};
Sm.prototype.set = function(a, b) {
  var c;
  if (c = "string" === typeof a) {
    a: {
      switch(a) {
        case "null":
        ;
        case "string":
        ;
        case "boolean":
        ;
        case "number":
        ;
        case "array":
        ;
        case "map":
          c = !1;
          break a;
      }
      c = !0;
    }
  }
  c ? this.na[a] = b : this.na[Am(a)] = b;
};
function Tm(a) {
  this.Jb = a || {};
  this.Wc = null != this.Jb.preferStrings ? this.Jb.preferStrings : !0;
  this.Ud = this.Jb.objectBuilder || null;
  this.na = new Sm;
  if (a = this.Jb.handlers) {
    if (wl(a) || !a.forEach) {
      throw Error('transit writer "handlers" option must be a map');
    }
    var b = this;
    a.forEach(function(a, d) {
      b.na.set(d, a);
    });
  }
  this.ad = this.Jb.unpack || function(a) {
    return a instanceof $ && null === a.P ? a.Z : !1;
  };
  this.xc = this.Jb && this.Jb.verbose || !1;
}
Tm.prototype.vb = function(a) {
  var b = this.na.get(null == a ? null : a.constructor);
  return null != b ? b : (a = a && a.transitTag) ? this.na.get(a) : null;
};
function Um(a, b, c, d, e) {
  a = a + b + c;
  return e ? e.write(a, d) : a;
}
function Vm(a, b, c) {
  var d = [];
  if (wl(b)) {
    for (var e = 0;e < b.length;e++) {
      d.push(Wm(a, b[e], !1, c));
    }
  } else {
    b.forEach(function(b) {
      d.push(Wm(a, b, !1, c));
    });
  }
  return d;
}
function Xm(a, b) {
  if ("string" !== typeof b) {
    var c = a.vb(b);
    return c && 1 === c.tag(b).length;
  }
  return!0;
}
function Ym(a, b) {
  var c = a.ad(b), d = !0;
  if (c) {
    for (var e = 0;e < c.length && (d = Xm(a, c[e]), d);e += 2) {
    }
    return d;
  }
  if (b.keys && (c = b.keys(), c.next)) {
    for (step = c.next();!step.done;) {
      d = Xm(a, step.value);
      if (!d) {
        break;
      }
      step = c.next();
    }
    return d;
  }
  if (b.forEach) {
    return b.forEach(function(b, c) {
      d = d && Xm(a, c);
    }), d;
  }
  throw Error("Cannot walk keys of object type " + (null == b ? null : b.constructor).name);
}
function Zm(a, b, c) {
  if (b.constructor === Object || null != b.forEach) {
    if (a.xc) {
      if (null != b.forEach) {
        if (Ym(a, b)) {
          var d = {};
          b.forEach(function(b, e) {
            d[Wm(a, e, !0, !1)] = Wm(a, b, !1, c);
          });
        } else {
          var e = a.ad(b), f = [], h = Um("~#", "cmap", "", !0, c);
          if (e) {
            for (var k = 0;k < e.length;k += 2) {
              f.push(Wm(a, e[k], !0, !1)), f.push(Wm(a, e[k + 1], !1, c));
            }
          } else {
            b.forEach(function(b, d) {
              f.push(Wm(a, d, !0, !1));
              f.push(Wm(a, b, !1, c));
            });
          }
          d = {};
          d[h] = f;
        }
      } else {
        for (d = {}, e = vl(b), k = 0;k < e.length;k++) {
          d[Wm(a, e[k], !0, !1)] = Wm(a, b[e[k]], !1, c);
        }
      }
      return d;
    }
    if (null != b.forEach) {
      if (Ym(a, b)) {
        e = a.ad(b);
        d = ["^ "];
        if (e) {
          for (k = 0;k < e.length;k += 2) {
            d.push(Wm(a, e[k], !0, c)), d.push(Wm(a, e[k + 1], !1, c));
          }
        } else {
          b.forEach(function(b, e) {
            d.push(Wm(a, e, !0, c));
            d.push(Wm(a, b, !1, c));
          });
        }
        return d;
      }
      e = a.ad(b);
      f = [];
      h = Um("~#", "cmap", "", !0, c);
      if (e) {
        for (k = 0;k < e.length;k += 2) {
          f.push(Wm(a, e[k], !0, c)), f.push(Wm(a, e[k + 1], !1, c));
        }
      } else {
        b.forEach(function(b, d) {
          f.push(Wm(a, d, !0, c));
          f.push(Wm(a, b, !1, c));
        });
      }
      return[h, f];
    }
    d = ["^ "];
    e = vl(b);
    for (k = 0;k < e.length;k++) {
      d.push(Wm(a, e[k], !0, c)), d.push(Wm(a, b[e[k]], !1, c));
    }
    return d;
  }
  if (null != a.Ud) {
    return a.Ud(b, function(b) {
      return Wm(a, b, !0, c);
    }, function(b) {
      return Wm(a, b, !1, c);
    });
  }
  k = (null == b ? null : b.constructor).name;
  e = Error("Cannot write " + k);
  e.data = {wd:b, type:k};
  throw e;
}
function Wm(a, b, c, d) {
  var e = a.vb(b), f = e ? e.tag(b) : null, h = e ? e.M(b) : null;
  if (null != e && null != f) {
    switch(f) {
      case "_":
        return c ? Um("~", "_", "", c, d) : null;
      case "s":
        return 0 < h.length ? (a = h.charAt(0), a = "~" === a || "^" === a || "`" === a ? "~" + h : h) : a = h, Um("", "", a, c, d);
      case "?":
        return c ? Um("~", "?", h.toString()[0], c, d) : h;
      case "i":
        return Infinity === h ? Um("~", "z", "INF", c, d) : -Infinity === h ? Um("~", "z", "-INF", c, d) : isNaN(h) ? Um("~", "z", "NaN", c, d) : c || "string" === typeof h || h instanceof Fl ? Um("~", "i", h.toString(), c, d) : h;
      case "d":
        return c ? Um(h.Ie, "d", h, c, d) : h;
      case "b":
        return Um("~", "b", h, c, d);
      case "'":
        return a.xc ? (b = {}, c = Um("~#", "'", "", !0, d), b[c] = Wm(a, h, !1, d), d = b) : d = [Um("~#", "'", "", !0, d), Wm(a, h, !1, d)], d;
      case "array":
        return Vm(a, h, d);
      case "map":
        return Zm(a, h, d);
      default:
        a: {
          if (1 === f.length) {
            if ("string" === typeof h) {
              d = Um("~", f, h, c, d);
              break a;
            }
            if (c || a.Wc) {
              (a = a.xc && new Jm) ? (f = a.tag(b), h = a.fa(b, a)) : h = e.fa(b, e);
              if (null !== h) {
                d = Um("~", f, h, c, d);
                break a;
              }
              d = Error('Tag "' + f + '" cannot be encoded as string');
              d.data = {tag:f, M:h, wd:b};
              throw d;
            }
          }
          b = f;
          c = h;
          a.xc ? (h = {}, h[Um("~#", b, "", !0, d)] = Wm(a, c, !1, d), d = h) : d = [Um("~#", b, "", !0, d), Wm(a, c, !1, d)];
        }
        return d;
    }
  } else {
    throw d = (null == b ? null : b.constructor).name, a = Error("Cannot write " + d), a.data = {wd:b, type:d}, a;
  }
}
function $m(a, b) {
  var c = a.vb(b);
  if (null != c) {
    return 1 === c.tag(b).length ? am("'", b) : b;
  }
  var c = (null == b ? null : b.constructor).name, d = Error("Cannot write " + c);
  d.data = {wd:b, type:c};
  throw d;
}
function an(a, b) {
  this.dc = a;
  this.options = b || {};
  this.Ca = !1 === this.options.cache ? null : this.options.cache ? this.options.cache : new pm;
}
an.prototype.Ae = function() {
  return this.dc;
};
an.prototype.marshaller = an.prototype.Ae;
an.prototype.write = function(a, b) {
  var c = null, d = b || {}, c = d.asMapKey || !1, e = this.dc.xc ? !1 : this.Ca;
  !1 === d.marshalTop ? c = Wm(this.dc, a, c, e) : (d = this.dc, c = JSON.stringify(Wm(d, $m(d, a), c, e)));
  null != this.Ca && this.Ca.clear();
  return c;
};
an.prototype.write = an.prototype.write;
an.prototype.register = function(a, b) {
  this.dc.na.set(a, b);
};
an.prototype.register = an.prototype.register;
function bn(a, b) {
  if ("json" === a || "json-verbose" === a || null == a) {
    var c = new vm(b);
    return new wm(c, b);
  }
  throw Error("Cannot create reader of type " + a);
}
function cn(a, b) {
  if ("json" === a || "json-verbose" === a || null == a) {
    "json-verbose" === a && (null == b && (b = {}), b.verbose = !0);
    var c = new Tm(b);
    return new an(c, b);
  }
  c = Error('Type must be "json"');
  c.data = {type:a};
  throw c;
}
;Zg.prototype.B = function(a, b) {
  return b instanceof Zg ? this.yb === b.yb : b instanceof gm ? this.yb === b.toString() : !1;
};
$l.prototype.B = function(a, b) {
  return this.equiv(b);
};
gm.prototype.B = function(a, b) {
  return b instanceof Zg ? ac(b, this) : this.equiv(b);
};
Fl.prototype.B = function(a, b) {
  return this.equiv(b);
};
$l.prototype.kd = !0;
$l.prototype.J = function() {
  return Dl.e ? Dl.e(this) : Dl.call(null, this);
};
gm.prototype.kd = !0;
gm.prototype.J = function() {
  return Dl.e ? Dl.e(this) : Dl.call(null, this);
};
Fl.prototype.kd = !0;
Fl.prototype.J = function() {
  return Dl.e ? Dl.e(this) : Dl.call(null, this);
};
function dn(a, b) {
  for (var c = F(vd(b)), d = null, e = 0, f = 0;;) {
    if (f < e) {
      var h = d.K(null, f);
      a[h] = b[h];
      f += 1;
    } else {
      if (c = F(c)) {
        d = c, ud(d) ? (c = rc(d), f = sc(d), d = c, e = O(c), c = f) : (c = G(d), a[c] = b[c], c = K(d), d = null, e = 0), f = 0;
      } else {
        break;
      }
    }
  }
  return a;
}
function en() {
}
en.prototype.Ub = function() {
  return lc(wf);
};
en.prototype.add = function(a, b, c) {
  return ge.g(a, b, c);
};
en.prototype.Pc = function(a) {
  return nc(a);
};
en.prototype.Eb = function(a) {
  return zf.g ? zf.g(a, !0, !0) : zf.call(null, a, !0, !0);
};
function fn() {
}
fn.prototype.Ub = function() {
  return lc(fd);
};
fn.prototype.add = function(a, b) {
  return fe.a(a, b);
};
fn.prototype.Pc = function(a) {
  return nc(a);
};
fn.prototype.Eb = function(a) {
  return Te.a ? Te.a(a, !0) : Te.call(null, a, !0);
};
var gn = function() {
  function a(a, b) {
    var c = Qd(a), h = dn({prefersStrings:!1, arrayBuilder:new fn, mapBuilder:new en, handlers:Sg(rg.j(L([new s(null, 5, ["$", function() {
      return function(a) {
        return Mc.e(a);
      };
    }(c), ":", function() {
      return function(a) {
        return Rd.e(a);
      };
    }(c), "set", function() {
      return function(a) {
        return ye.a(ug, a);
      };
    }(c), "list", function() {
      return function(a) {
        return ye.a(J, a.reverse());
      };
    }(c), "cmap", function() {
      return function(a) {
        for (var b = 0, c = lc(wf);;) {
          if (b < a.length) {
            var d = b + 2, c = ge.g(c, a[b], a[b + 1]), b = d
          } else {
            return nc(c);
          }
        }
      };
    }(c)], null), ph.e(b)], 0)))}, Sg(kd.a(b, ph)));
    return bn.a ? bn.a(c, h) : bn.call(null, c, h);
  }
  function b(a) {
    return c.a(a, null);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function hn() {
}
hn.prototype.tag = function() {
  return ":";
};
hn.prototype.M = function(a) {
  return a.Da;
};
hn.prototype.fa = function(a) {
  return a.Da;
};
function jn() {
}
jn.prototype.tag = function() {
  return "$";
};
jn.prototype.M = function(a) {
  return a.Ba;
};
jn.prototype.fa = function(a) {
  return a.Ba;
};
function kn() {
}
kn.prototype.tag = function() {
  return "list";
};
kn.prototype.M = function(a) {
  var b = [];
  a = F(a);
  for (var c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e);
      b.push(f);
      e += 1;
    } else {
      if (a = F(a)) {
        c = a, ud(c) ? (a = rc(c), e = sc(c), c = a, d = O(a), a = e) : (a = G(c), b.push(a), a = K(c), c = null, d = 0), e = 0;
      } else {
        break;
      }
    }
  }
  return am.a ? am.a("array", b) : am.call(null, "array", b);
};
kn.prototype.fa = function() {
  return null;
};
function ln() {
}
ln.prototype.tag = function() {
  return "map";
};
ln.prototype.M = function(a) {
  return a;
};
ln.prototype.fa = function() {
  return null;
};
function mn() {
}
mn.prototype.tag = function() {
  return "set";
};
mn.prototype.M = function(a) {
  var b = [];
  a = F(a);
  for (var c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e);
      b.push(f);
      e += 1;
    } else {
      if (a = F(a)) {
        c = a, ud(c) ? (a = rc(c), e = sc(c), c = a, d = O(a), a = e) : (a = G(c), b.push(a), a = K(c), c = null, d = 0), e = 0;
      } else {
        break;
      }
    }
  }
  return am.a ? am.a("array", b) : am.call(null, "array", b);
};
mn.prototype.fa = function() {
  return null;
};
function nn() {
}
nn.prototype.tag = function() {
  return "array";
};
nn.prototype.M = function(a) {
  var b = [];
  a = F(a);
  for (var c = null, d = 0, e = 0;;) {
    if (e < d) {
      var f = c.K(null, e);
      b.push(f);
      e += 1;
    } else {
      if (a = F(a)) {
        c = a, ud(c) ? (a = rc(c), e = sc(c), c = a, d = O(a), a = e) : (a = G(c), b.push(a), a = K(c), c = null, d = 0), e = 0;
      } else {
        break;
      }
    }
  }
  return b;
};
nn.prototype.fa = function() {
  return null;
};
function on() {
}
on.prototype.tag = function() {
  return "u";
};
on.prototype.M = function(a) {
  return a.yb;
};
on.prototype.fa = function(a) {
  return this.M(a);
};
var pn = function() {
  function a(a, b) {
    var c = new hn, h = new jn, k = new kn, l = new ln, m = new mn, n = new nn, p = new on, r = rg.j(L([id([Tf, Od, s, Rf, ef, Nc, T, Md, Sd, Ze, df, Sf, qg, rf, U, Ld, bd, sg, lg, pg, We, vg, Xd, E, Zg, yg, Yf], [l, k, l, k, k, k, c, k, k, n, k, k, k, k, n, k, k, m, l, k, k, m, k, h, p, k, k]), ph.e(b)], 0)), v = Qd(a), y = dn({unpack:function() {
      return function(a) {
        return a instanceof s ? a.h : !1;
      };
    }(v, c, h, k, l, m, n, p, r), handlers:function() {
      var a = sb(r);
      a.forEach = function() {
        return function(a) {
          for (var b = F(this), c = null, d = 0, e = 0;;) {
            if (e < d) {
              var f = c.K(null, e), h = Q.g(f, 0, null), f = Q.g(f, 1, null);
              a.a ? a.a(f, h) : a.call(null, f, h);
              e += 1;
            } else {
              if (b = F(b)) {
                ud(b) ? (c = rc(b), b = sc(b), h = c, d = O(c), c = h) : (c = G(b), h = Q.g(c, 0, null), c = f = Q.g(c, 1, null), a.a ? a.a(c, h) : a.call(null, c, h), b = K(b), c = null, d = 0), e = 0;
              } else {
                return null;
              }
            }
          }
        };
      }(a, v, c, h, k, l, m, n, p, r);
      return a;
    }(), objectBuilder:function(a, b, c, d, e, f, h, k, l) {
      return function(m, n, p) {
        return Ed(function() {
          return function(a, b, c) {
            a.push(n.e ? n.e(b) : n.call(null, b), p.e ? p.e(c) : p.call(null, c));
            return a;
          };
        }(a, b, c, d, e, f, h, k, l), ["^ "], m);
      };
    }(v, c, h, k, l, m, n, p, r)}, Sg(kd.a(b, ph)));
    return cn.a ? cn.a(v, y) : cn.call(null, v, y);
  }
  function b(a) {
    return c.a(a, null);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function qn(a) {
  if (a ? a.Kd : a) {
    return a.Kd();
  }
  var b;
  b = qn[q(null == a ? null : a)];
  if (!b && (b = qn._, !b)) {
    throw w("PushbackReader.read-char", a);
  }
  return b.call(null, a);
}
function rn(a, b) {
  if (a ? a.Ld : a) {
    return a.Ld(0, b);
  }
  var c;
  c = rn[q(null == a ? null : a)];
  if (!c && (c = rn._, !c)) {
    throw w("PushbackReader.unread", a);
  }
  return c.call(null, a, b);
}
function sn(a, b, c) {
  this.I = a;
  this.buffer = b;
  this.O = c;
}
sn.prototype.Kd = function() {
  return 0 === this.buffer.length ? (this.O += 1, this.I[this.O]) : this.buffer.pop();
};
sn.prototype.Ld = function(a, b) {
  return this.buffer.push(b);
};
function tn(a) {
  var b = !/[^\t\n\r ]/.test(a);
  return t(b) ? b : "," === a;
}
function un(a, b) {
  var c;
  !(c = !/[^0-9]/.test(b)) && (c = "+" === b || "-" === b) && (c = qn(a), rn(a, c), c = !/[^0-9]/.test(c));
  return c;
}
var vn = function() {
  function a(a, d) {
    var e = null;
    1 < arguments.length && (e = L(Array.prototype.slice.call(arguments, 1), 0));
    return b.call(this, 0, e);
  }
  function b(a, b) {
    throw Error(S.a(x, b));
  }
  a.D = 1;
  a.s = function(a) {
    G(a);
    a = I(a);
    return b(0, a);
  };
  a.j = b;
  return a;
}();
function wn(a, b) {
  for (var c = new La(b), d = qn(a);;) {
    var e;
    if (!(e = null == d || tn(d))) {
      e = d;
      var f = "#" !== e;
      e = f ? (f = "'" !== e) ? (f = ":" !== e) ? xn.e ? xn.e(e) : xn.call(null, e) : f : f : f;
    }
    if (e) {
      return rn(a, d), c.toString();
    }
    c.append(d);
    d = qn(a);
  }
}
function yn(a) {
  for (;;) {
    var b = qn(a);
    if ("\n" === b || "\r" === b || null == b) {
      return a;
    }
  }
}
var zn = Dg("^([-+]?)(?:(0)|([1-9][0-9]*)|0[xX]([0-9A-Fa-f]+)|0([0-7]+)|([1-9][0-9]?)[rR]([0-9A-Za-z]+))(N)?$"), An = Dg("^([-+]?[0-9]+)/([0-9]+)$"), Bn = Dg("^([-+]?[0-9]+(\\.[0-9]*)?([eE][-+]?[0-9]+)?)(M)?$"), Cn = Dg("^[:]?([^0-9/].*/)?([^0-9/][^/]*)$");
function Dn(a, b) {
  var c = a.exec(b);
  return null != c && c[0] === b ? 1 === c.length ? c[0] : c : null;
}
function En(a) {
  if (t(Dn(zn, a))) {
    a = Dn(zn, a);
    var b = a[2];
    if (null != (C.a(b, "") ? null : b)) {
      a = 0;
    } else {
      var b = t(a[3]) ? [a[3], 10] : t(a[4]) ? [a[4], 16] : t(a[5]) ? [a[5], 8] : t(a[6]) ? [a[7], parseInt(a[6], 10)] : [null, null], c = b[0];
      null == c ? a = null : (b = parseInt(c, b[1]), a = "-" === a[1] ? -b : b);
    }
  } else {
    t(Dn(An, a)) ? (a = Dn(An, a), a = parseInt(a[1], 10) / parseInt(a[2], 10)) : a = t(Dn(Bn, a)) ? parseFloat(a) : null;
  }
  return a;
}
var Fn = Dg("^[0-9A-Fa-f]{2}$"), Gn = Dg("^[0-9A-Fa-f]{4}$");
function Hn(a, b, c, d) {
  return t(Bg(a, d)) ? d : vn.j(b, L(["Unexpected unicode escape \\", c, d], 0));
}
function In(a) {
  return String.fromCharCode(parseInt(a, 16));
}
function Jn(a) {
  var b = qn(a), c = "t" === b ? "\t" : "r" === b ? "\r" : "n" === b ? "\n" : "\\" === b ? "\\" : '"' === b ? '"' : "b" === b ? "\b" : "f" === b ? "\f" : null;
  t(c) ? a = c : "x" === b ? (c = (new La(qn(a), qn(a))).toString(), a = In(Hn(Fn, a, b, c))) : "u" === b ? (c = (new La(qn(a), qn(a), qn(a), qn(a))).toString(), a = In(Hn(Gn, a, b, c))) : a = /[^0-9]/.test(b) ? vn.j(a, L(["Unexpected unicode escape \\", b], 0)) : String.fromCharCode(b);
  return a;
}
function Kn(a) {
  for (var b = qn(a);;) {
    var c;
    c = b;
    c = tn.e ? tn.e(c) : tn.call(null, c);
    if (t(c)) {
      b = qn(a);
    } else {
      return b;
    }
  }
}
function Ln(a, b) {
  for (var c = lc(fd);;) {
    var d = Kn(b);
    t(d) || vn.j(b, L(["EOF while reading"], 0));
    if (a === d) {
      return nc(c);
    }
    var e = function() {
      var a = d;
      return xn.e ? xn.e(a) : xn.call(null, a);
    }();
    if (t(e)) {
      var f = e, e = function() {
        var a = d;
        return f.a ? f.a(b, a) : f.call(null, b, a);
      }()
    } else {
      rn(b, d), e = Mn.v ? Mn.v(b, !0, null, !0) : Mn.call(null, b, !0, null);
    }
    c = e === b ? c : fe.a(c, e);
  }
}
function Nn(a, b) {
  return vn.j(a, L(["Reader for ", b, " not implemented yet"], 0));
}
function On(a, b) {
  var c = qn(a), d = Pn.e ? Pn.e(c) : Pn.call(null, c);
  if (t(d)) {
    return d.a ? d.a(a, b) : d.call(null, a, b);
  }
  d = Qn.a ? Qn.a(a, c) : Qn.call(null, a, c);
  return t(d) ? d : vn.j(a, L(["No dispatch macro for ", c], 0));
}
function Rn(a, b) {
  return vn.j(a, L(["Unmached delimiter ", b], 0));
}
function Sn(a) {
  return S.a(Nd, Ln(")", a));
}
function Tn(a) {
  return Ln("]", a);
}
function Un(a) {
  var b = Ln("}", a), c = O(b);
  if ("number" !== typeof c || !hb(isNaN(c)) || Infinity === c || parseFloat(c) !== parseInt(c, 10)) {
    throw Error("Argument must be an integer: " + x.e(c));
  }
  0 !== (c & 1) && vn.j(a, L(["Map literal must contain an even number of forms"], 0));
  return S.a(oe, b);
}
function Vn(a, b) {
  for (var c = new La(b), d = qn(a);;) {
    if (t(function() {
      var a = null == d;
      if (a || (a = tn(d))) {
        return a;
      }
      a = d;
      return xn.e ? xn.e(a) : xn.call(null, a);
    }())) {
      rn(a, d);
      var e = c.toString(), c = En(e);
      return t(c) ? c : vn.j(a, L(["Invalid number format [", e, "]"], 0));
    }
    c.append(d);
    d = e = qn(a);
  }
}
function Wn(a) {
  for (var b = new La, c = qn(a);;) {
    if (null == c) {
      return vn.j(a, L(["EOF while reading"], 0));
    }
    if ("\\" === c) {
      b.append(Jn(a));
    } else {
      if ('"' === c) {
        return b.toString();
      }
      b.append(c);
    }
    c = qn(a);
  }
}
function Xn(a) {
  for (var b = new La, c = qn(a);;) {
    if (null == c) {
      return vn.j(a, L(["EOF while reading"], 0));
    }
    if ("\\" === c) {
      b.append(c);
      var d = qn(a);
      if (null == d) {
        return vn.j(a, L(["EOF while reading"], 0));
      }
      var e = function() {
        var a = b;
        a.append(d);
        return a;
      }(), f = qn(a);
    } else {
      if ('"' === c) {
        return b.toString();
      }
      e = function() {
        var a = b;
        a.append(c);
        return a;
      }();
      f = qn(a);
    }
    b = e;
    c = f;
  }
}
function Yn(a, b) {
  var c = wn(a, b);
  if (t(-1 != c.indexOf("/"))) {
    c = Mc.a(Kd.g(c, 0, c.indexOf("/")), Kd.g(c, c.indexOf("/") + 1, c.length));
  } else {
    var d = Mc.e(c), c = "nil" === c ? null : "true" === c ? !0 : "false" === c ? !1 : d
  }
  return c;
}
function Zn(a) {
  var b = wn(a, qn(a)), c = Dn(Cn, b), b = c[0], d = c[1], c = c[2];
  return void 0 !== d && ":/" === d.substring(d.length - 2, d.length) || ":" === c[c.length - 1] || -1 !== b.indexOf("::", 1) ? vn.j(a, L(["Invalid token: ", b], 0)) : null != d && 0 < d.length ? Rd.a(d.substring(0, d.indexOf("/")), c) : Rd.e(b);
}
function $n(a) {
  return function(b) {
    return xb(xb(J, Mn.v ? Mn.v(b, !0, null, !0) : Mn.call(null, b, !0, null)), a);
  };
}
function ao() {
  return function(a) {
    return vn.j(a, L(["Unreadable form"], 0));
  };
}
function bo(a) {
  var b;
  b = Mn.v ? Mn.v(a, !0, null, !0) : Mn.call(null, a, !0, null);
  b = b instanceof E ? new s(null, 1, [Jh, b], null) : "string" === typeof b ? new s(null, 1, [Jh, b], null) : b instanceof T ? new zf([b, !0], !0, !1) : b;
  sd(b) || vn.j(a, L(["Metadata must be Symbol,Keyword,String or Map"], 0));
  var c = Mn.v ? Mn.v(a, !0, null, !0) : Mn.call(null, a, !0, null);
  return(c ? c.p & 262144 || c.ue || (c.p ? 0 : u(Wb, c)) : u(Wb, c)) ? cd(c, rg.j(L([nd(c), b], 0))) : vn.j(a, L(["Metadata can only be applied to IWithMetas"], 0));
}
function co(a) {
  a: {
    if (a = Ln("}", a), a = F(a), null == a) {
      a = ug;
    } else {
      if (a instanceof Nc && 0 === a.A) {
        a = a.h;
        b: {
          for (var b = 0, c = lc(ug);;) {
            if (b < a.length) {
              var d = b + 1, c = c.Ab(null, a[b]), b = d
            } else {
              a = c;
              break b;
            }
          }
          a = void 0;
        }
        a = a.Bb(null);
      } else {
        for (d = lc(ug);;) {
          if (null != a) {
            b = a.pa(null), d = d.Ab(null, a.ga(null)), a = b;
          } else {
            a = d.Bb(null);
            break a;
          }
        }
        a = void 0;
      }
    }
  }
  return a;
}
function eo(a) {
  return Dg(Xn(a));
}
function fo(a) {
  Mn.v ? Mn.v(a, !0, null, !0) : Mn.call(null, a, !0, null);
  return a;
}
function xn(a) {
  return'"' === a ? Wn : ":" === a ? Zn : ";" === a ? yn : "'" === a ? $n(new E(null, "quote", "quote", 1377916282, null)) : "@" === a ? $n(new E(null, "deref", "deref", 1494944732, null)) : "^" === a ? bo : "`" === a ? Nn : "~" === a ? Nn : "(" === a ? Sn : ")" === a ? Rn : "[" === a ? Tn : "]" === a ? Rn : "{" === a ? Un : "}" === a ? Rn : "\\" === a ? qn : "#" === a ? On : null;
}
function Pn(a) {
  return "{" === a ? co : "\x3c" === a ? ao() : '"' === a ? eo : "!" === a ? yn : "_" === a ? fo : null;
}
function Mn(a, b, c) {
  for (;;) {
    var d = qn(a);
    if (null == d) {
      return t(b) ? vn.j(a, L(["EOF while reading"], 0)) : c;
    }
    if (!tn(d)) {
      if (";" === d) {
        var e = function() {
          var b = a, c = d;
          return yn.a ? yn.a(b, c) : yn.call(null, b);
        }();
        a = e;
      } else {
        var f = xn(d), e = t(f) ? function() {
          var b = a, c = d;
          return f.a ? f.a(b, c) : f.call(null, b, c);
        }() : un(a, d) ? Vn(a, d) : Yn(a, d);
        if (e !== a) {
          return e;
        }
      }
    }
  }
}
var go = function(a, b) {
  return function(c, d) {
    return R.a(t(d) ? b : a, c);
  };
}(new U(null, 13, 5, W, [null, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], null), new U(null, 13, 5, W, [null, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], null)), ho = /(\d\d\d\d)(?:-(\d\d)(?:-(\d\d)(?:[T](\d\d)(?::(\d\d)(?::(\d\d)(?:[.](\d+))?)?)?)?)?)?(?:[Z]|([-+])(\d\d):(\d\d))?/;
function io(a) {
  a = parseInt(a, 10);
  return hb(isNaN(a)) ? a : null;
}
function jo(a, b, c, d) {
  a <= b && b <= c || vn.j(null, L(["" + x.e(d) + " Failed:  " + x.e(a) + "\x3c\x3d" + x.e(b) + "\x3c\x3d" + x.e(c)], 0));
  return b;
}
function ko(a) {
  var b = Bg(ho, a);
  Q.g(b, 0, null);
  var c = Q.g(b, 1, null), d = Q.g(b, 2, null), e = Q.g(b, 3, null), f = Q.g(b, 4, null), h = Q.g(b, 5, null), k = Q.g(b, 6, null), l = Q.g(b, 7, null), m = Q.g(b, 8, null), n = Q.g(b, 9, null), p = Q.g(b, 10, null);
  if (hb(b)) {
    return vn.j(null, L(["Unrecognized date/time syntax: " + x.e(a)], 0));
  }
  var r = io(c), v = function() {
    var a = io(d);
    return t(a) ? a : 1;
  }();
  a = function() {
    var a = io(e);
    return t(a) ? a : 1;
  }();
  var b = function() {
    var a = io(f);
    return t(a) ? a : 0;
  }(), c = function() {
    var a = io(h);
    return t(a) ? a : 0;
  }(), y = function() {
    var a = io(k);
    return t(a) ? a : 0;
  }(), B = function() {
    var a;
    a: {
      if (C.a(3, O(l))) {
        a = l;
      } else {
        if (3 < O(l)) {
          a = Kd.g(l, 0, 3);
        } else {
          for (a = new La(l);;) {
            if (3 > a.rb.length) {
              a = a.append("0");
            } else {
              a = a.toString();
              break a;
            }
          }
          a = void 0;
        }
      }
    }
    a = io(a);
    return t(a) ? a : 0;
  }(), m = (C.a(m, "-") ? -1 : 1) * (60 * function() {
    var a = io(n);
    return t(a) ? a : 0;
  }() + function() {
    var a = io(p);
    return t(a) ? a : 0;
  }());
  return new U(null, 8, 5, W, [r, jo(1, v, 12, "timestamp month field must be in range 1..12"), jo(1, a, function() {
    var a;
    if (a = 0 === (r % 4 + 4) % 4) {
      a = 0 !== (r % 100 + 100) % 100 || 0 === (r % 400 + 400) % 400;
    }
    return go.a ? go.a(v, a) : go.call(null, v, a);
  }(), "timestamp day field must be in range 1..last day in month"), jo(0, b, 23, "timestamp hour field must be in range 0..23"), jo(0, c, 59, "timestamp minute field must be in range 0..59"), jo(0, y, C.a(c, 59) ? 60 : 59, "timestamp second field must be in range 0..60"), jo(0, B, 999, "timestamp millisecond field must be in range 0..999"), m], null);
}
var lo, mo = new s(null, 4, ["inst", function(a) {
  var b;
  if ("string" === typeof a) {
    if (b = ko(a), t(b)) {
      a = Q.g(b, 0, null);
      var c = Q.g(b, 1, null), d = Q.g(b, 2, null), e = Q.g(b, 3, null), f = Q.g(b, 4, null), h = Q.g(b, 5, null), k = Q.g(b, 6, null);
      b = Q.g(b, 7, null);
      b = new Date(Date.UTC(a, c - 1, d, e, f, h, k) - 6E4 * b);
    } else {
      b = vn.j(null, L(["Unrecognized date/time syntax: " + x.e(a)], 0));
    }
  } else {
    b = vn.j(null, L(["Instance literal expects a string for its timestamp."], 0));
  }
  return b;
}, "uuid", function(a) {
  return "string" === typeof a ? new Zg(a) : vn.j(null, L(["UUID literal expects a string as its representation."], 0));
}, "queue", function(a) {
  return td(a) ? ye.a(ff, a) : vn.j(null, L(["Queue literal expects a vector for its elements."], 0));
}, "js", function(a) {
  if (td(a)) {
    var b = [];
    a = F(a);
    for (var c = null, d = 0, e = 0;;) {
      if (e < d) {
        var f = c.K(null, e);
        b.push(f);
        e += 1;
      } else {
        if (a = F(a)) {
          c = a, ud(c) ? (a = rc(c), e = sc(c), c = a, d = O(a), a = e) : (a = G(c), b.push(a), a = K(c), c = null, d = 0), e = 0;
        } else {
          break;
        }
      }
    }
    return b;
  }
  if (sd(a)) {
    b = {};
    a = F(a);
    c = null;
    for (e = d = 0;;) {
      if (e < d) {
        var h = c.K(null, e), f = Q.g(h, 0, null), h = Q.g(h, 1, null);
        b[Qd(f)] = h;
        e += 1;
      } else {
        if (a = F(a)) {
          ud(a) ? (d = rc(a), a = sc(a), c = d, d = O(d)) : (d = G(a), c = Q.g(d, 0, null), d = Q.g(d, 1, null), b[Qd(c)] = d, a = K(a), c = null, d = 0), e = 0;
        } else {
          break;
        }
      }
    }
    return b;
  }
  return vn.j(null, L(["JS literal expects a vector or map containing only string or unqualified keyword keys"], 0));
}], null);
lo = qe.e ? qe.e(mo) : qe.call(null, mo);
var no = qe.e ? qe.e(null) : qe.call(null, null);
function Qn(a, b) {
  var c = Yn(a, b), d = R.a(M.e ? M.e(lo) : M.call(null, lo), "" + x.e(c)), e = M.e ? M.e(no) : M.call(null, no);
  return t(d) ? (c = Mn(a, !0, null), d.e ? d.e(c) : d.call(null, c)) : t(e) ? (d = Mn(a, !0, null), e.a ? e.a(c, d) : e.call(null, c, d)) : vn.j(a, L(["Could not find tag parser for ", "" + x.e(c), " in ", se.j(L([tf(M.e ? M.e(lo) : M.call(null, lo))], 0))], 0));
}
;function oo(a, b, c, d, e, f, h) {
  if (a ? a.ee : a) {
    return a.ee(a, b, c, d, e, f, h);
  }
  var k;
  k = oo[q(null == a ? null : a)];
  if (!k && (k = oo._, !k)) {
    throw w("AjaxImpl.-js-ajax-request", a);
  }
  return k.call(null, a, b, c, d, e, f, h);
}
var po = {};
"undefined" !== typeof FormData && (FormData.prototype.fe = !0);
function qo(a) {
  var b = a ? t(t(null) ? null : a.fe) ? !0 : a.Mc ? !1 : u(po, a) : u(po, a);
  return b ? b : "string" === typeof a;
}
oo["null"] = function(a, b, c, d, e, f, h) {
  a = zd(h) ? S.a(oe, h) : h;
  a = R.a(a, Mh);
  h = new al;
  bk(h, "complete", f);
  h.ac = Math.max(0, t(a) ? a : 0);
  h.send(b, c, d, e);
  return h;
};
function ro(a) {
  a: {
    a = [a];
    var b = a.length;
    if (b <= xf) {
      for (var c = 0, d = lc(wf);;) {
        if (c < b) {
          var e = c + 1, d = oc(d, a[c], null), c = e
        } else {
          a = new sg(null, nc(d), null);
          break a;
        }
      }
    } else {
      for (c = 0, d = lc(ug);;) {
        if (c < b) {
          e = c + 1, d = mc(d, a[c]), c = e;
        } else {
          a = nc(d);
          break a;
        }
      }
    }
    a = void 0;
  }
  return le(a, new U(null, 6, 5, W, [200, 201, 202, 204, 205, 206], null));
}
function so(a) {
  a = ql(a);
  return Mn(new sn(a, [], -1), !1, null);
}
var to = function() {
  function a() {
    return c.C();
  }
  function b() {
    return new s(null, 2, [fh, so, ah, "EDN"], null);
  }
  var c = null, c = function(c) {
    switch(arguments.length) {
      case 0:
        return b.call(this);
      case 1:
        return a.call(this);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.C = b;
  c.e = a;
  return c;
}(), uo = function() {
  function a(a) {
    return function(b) {
      return a.write(b);
    };
  }
  var b = null, b = function(b, d) {
    switch(arguments.length) {
      case 1:
        return a.call(this, b);
      case 2:
        return b.write(d);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  b.e = a;
  b.a = function(a, b) {
    return a.write(b);
  };
  return b;
}(), vo = function() {
  function a(a) {
    a = zd(a) ? S.a(oe, a) : a;
    var b = R.a(a, Ah), c = R.a(a, oh);
    a = t(b) ? b : pn.a(t(c) ? c : Lh, a);
    return new s(null, 2, [vh, uo.e(a), Eh, "application/transit+json; charset\x3dutf-8"], null);
  }
  function b() {
    return c.e(wf);
  }
  var c = null, c = function(c) {
    switch(arguments.length) {
      case 0:
        return b.call(this);
      case 1:
        return a.call(this, c);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.C = b;
  c.e = a;
  return c;
}(), wo = function() {
  function a(a, b, c) {
    c = ql(c);
    a = a.Zb(c);
    return t(b) ? a : Xg.e(a);
  }
  function b(a, b) {
    return function(c) {
      c = ql(c);
      c = a.Zb(c);
      return t(b) ? c : Xg.e(c);
    };
  }
  function c(a) {
    return function(b, c) {
      var d = ql(c), d = a.Zb(d);
      return t(b) ? d : Xg.e(d);
    };
  }
  var d = null, d = function(d, f, h) {
    switch(arguments.length) {
      case 1:
        return c.call(this, d);
      case 2:
        return b.call(this, d, f);
      case 3:
        return a.call(this, d, f, h);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.e = c;
  d.a = b;
  d.g = a;
  return d;
}(), xo = function() {
  function a(a) {
    var b = zd(a) ? S.a(oe, a) : a;
    a = R.a(b, ih);
    var c = R.a(b, Ch), h = R.a(b, oh), b = t(c) ? c : gn.a(t(h) ? h : Lh, b);
    return new s(null, 2, [fh, wo.a(b, a), ah, "Transit"], null);
  }
  function b() {
    return c.e(wf);
  }
  var c = null, c = function(c) {
    switch(arguments.length) {
      case 0:
        return b.call(this);
      case 1:
        return a.call(this, c);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.C = b;
  c.e = a;
  return c;
}();
function yo(a) {
  if (t(a)) {
    var b = new yk(Sg(a));
    a = wk(b);
    if ("undefined" == typeof a) {
      throw Error("Keys are undefined");
    }
    for (var c = new sl(null, 0, void 0), b = vk(b), d = 0;d < a.length;d++) {
      var e = a[d], f = b[d];
      if ("array" == q(f)) {
        var h = c;
        h.remove(e);
        0 < f.length && (h.Ja = null, h.ka.set(ul(h, e), Xa(f)), h.ja += f.length);
      } else {
        c.add(e, f);
      }
    }
    a = c.toString();
  } else {
    a = null;
  }
  return a;
}
function zo(a) {
  return ql(a);
}
function Ao() {
  return new s(null, 2, [vh, yo, Eh, "application/x-www-form-urlencoded"], null);
}
var Bo = function() {
  function a() {
    return c.C();
  }
  function b() {
    return new s(null, 2, [fh, zo, ah, "raw text"], null);
  }
  var c = null, c = function(c) {
    switch(arguments.length) {
      case 0:
        return b.call(this);
      case 1:
        return a.call(this);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.C = b;
  c.e = a;
  return c;
}();
function Co(a) {
  var b = new qk;
  a = Sg(a);
  var c = [];
  rk(b, a, c);
  return c.join("");
}
var Do = function() {
  function a(a, b, c, d) {
    a = rl(d, a);
    return t(b) ? a : Xg.j(a, L([Wg, c], 0));
  }
  function b(a, b, c) {
    return function(d) {
      d = rl(d, a);
      return t(b) ? d : Xg.j(d, L([Wg, c], 0));
    };
  }
  function c(a, b) {
    return function(c, d) {
      var e = rl(d, a);
      return t(b) ? e : Xg.j(e, L([Wg, c], 0));
    };
  }
  function d(a) {
    return function(b, c, d) {
      d = rl(d, a);
      return t(b) ? d : Xg.j(d, L([Wg, c], 0));
    };
  }
  var e = null, e = function(e, h, k, l) {
    switch(arguments.length) {
      case 1:
        return d.call(this, e);
      case 2:
        return c.call(this, e, h);
      case 3:
        return b.call(this, e, h, k);
      case 4:
        return a.call(this, e, h, k, l);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  e.e = d;
  e.a = c;
  e.g = b;
  e.v = a;
  return e;
}(), Eo = function() {
  function a(a) {
    var b = zd(a) ? S.a(oe, a) : a;
    a = R.a(b, ih);
    var c = R.a(b, eh), b = R.a(b, sh);
    return new s(null, 2, [fh, Do.g(b, a, c), ah, "JSON" + x.e(t(b) ? " prefix '" + x.e(b) + "'" : null) + x.e(t(c) ? " keywordize" : null)], null);
  }
  function b() {
    return c.e(wf);
  }
  var c = null, c = function(c) {
    switch(arguments.length) {
      case 0:
        return b.call(this);
      case 1:
        return a.call(this, c);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.C = b;
  c.e = a;
  return c;
}(), Fo = function() {
  function a(a, d, e, f) {
    var h = null;
    3 < arguments.length && (h = L(Array.prototype.slice.call(arguments, 3), 0));
    return b.call(this, a, d, e, h);
  }
  function b(a, b, e, f) {
    return new U(null, 2, 5, W, [!1, nb.g(gd, new s(null, 3, [zh, a, lh, b, gh, e], null), ue.a(Ue, ze.a(2, f)))], null);
  }
  a.D = 3;
  a.s = function(a) {
    var d = G(a);
    a = K(a);
    var e = G(a);
    a = K(a);
    var f = G(a);
    a = I(a);
    return b(d, e, f, a);
  };
  a.j = b;
  return a;
}();
function Go(a, b) {
  var c = zd(a) ? S.a(oe, a) : a, d = R.a(c, fh);
  try {
    var e = b.target, f = ol(e), h = me.a(Fo, f);
    if (C.a(-1, f)) {
      return C.a(e.Vb, 7) ? h.a ? h.a("Request aborted by client.", mh) : h.call(null, "Request aborted by client.", mh) : h.a ? h.a("Request timed out.", Mh) : h.call(null, "Request timed out.", Mh);
    }
    try {
      var k = d.e ? d.e(e) : d.call(null, e);
      if (t(ro(f))) {
        return new U(null, 2, 5, W, [!0, k], null);
      }
      var l = pl(e);
      return h.v ? h.v(l, Gh, $g, k) : h.call(null, l, Gh, $g, k);
    } catch (m) {
      if (m instanceof Object) {
        var h = m, d = W, n, p = zd(c) ? S.a(oe, c) : c, r = R.a(p, ah), v = new s(null, 3, [zh, f, gh, Gh, $g, null], null), y = "" + x.e(h.message) + "  Format should have been " + x.e(r), B = jd.j(v, lh, y, L([gh, Dh, dh, ql(e)], 0));
        n = t(ro(f)) ? B : jd.j(v, lh, pl(e), L([rh, B], 0));
        return new U(null, 2, 5, d, [!1, n], null);
      }
      throw m;
    }
  } catch (D) {
    if (D instanceof Object) {
      return h = D, Fo.j(0, h.message, Hh, L([Hh, h], 0));
    }
    throw D;
  }
}
function Ho(a) {
  return a instanceof T ? Qh(Qd(a)) : a;
}
var Io = function() {
  function a(a, b, c) {
    a = Go(a, c);
    return b.e ? b.e(a) : b.call(null, a);
  }
  function b(a, b) {
    return function(c) {
      c = Go(a, c);
      return b.e ? b.e(c) : b.call(null, c);
    };
  }
  function c(a) {
    return function(b, c) {
      var d = Go(a, c);
      return b.e ? b.e(d) : b.call(null, d);
    };
  }
  var d = null, d = function(d, f, h) {
    switch(arguments.length) {
      case 1:
        return c.call(this, d);
      case 2:
        return b.call(this, d, f);
      case 3:
        return a.call(this, d, f, h);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  d.e = c;
  d.a = b;
  d.g = a;
  return d;
}(), Jo = new U(null, 6, 5, W, [new U(null, 2, 5, W, ["application/json", Eo], null), new U(null, 2, 5, W, ["application/edn", to], null), new U(null, 2, 5, W, ["text/plain", Bo], null), new U(null, 2, 5, W, ["text/html", Bo], null), new U(null, 2, 5, W, ["application/transit+json", xo], null), new U(null, 2, 5, W, [null, Bo], null)], null), Ko = function() {
  function a(a, b) {
    var c = Q.g(b, 0, null);
    return null == c || 0 <= a.indexOf(c);
  }
  function b(a) {
    return function(b) {
      b = Q.g(b, 0, null);
      return null == b || 0 <= a.indexOf(b);
    };
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}();
function Lo(a, b) {
  var c = zd(b) ? S.a(oe, b) : b, d = R.a(c, qh), e = Ko.e(function() {
    var b = a.getResponseHeader("Content-Type");
    return t(b) ? b : "";
  }());
  return ed(G(xe.a(e, d))).call(null, c);
}
var Mo = function() {
  function a(a, b) {
    return fh.e(Lo(b, a)).call(null, b);
  }
  function b(a) {
    return function(b) {
      return fh.e(Lo(b, a)).call(null, b);
    };
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), No = function() {
  function a(a) {
    return new s(null, 2, [fh, Mo.e(a), ch, "(from content type)"], null);
  }
  function b() {
    return c.e(new s(null, 1, [qh, Jo], null));
  }
  var c = null, c = function(c) {
    switch(arguments.length) {
      case 0:
        return b.call(this);
      case 1:
        return a.call(this, c);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.C = b;
  c.e = a;
  return c;
}();
function Oo(a, b) {
  if (sd(a)) {
    return a;
  }
  if (ld(a)) {
    return new s(null, 1, [vh, a], null);
  }
  if (null == a) {
    return vo.e(b);
  }
  switch(a instanceof T ? a.Da : null) {
    case "url":
      return Ao();
    case "raw":
      return Ao();
    case "edn":
      return new s(null, 2, [vh, se, Eh, "application/edn"], null);
    case "json":
      return new s(null, 2, [vh, Co, Eh, "application/json"], null);
    case "transit":
      return vo.e(b);
    default:
      return null;
  }
}
function Po(a, b) {
  if (sd(a)) {
    return a;
  }
  if (ld(a)) {
    return new s(null, 2, [fh, a, ah, "custom"], null);
  }
  if (null == a) {
    return No.C();
  }
  switch(a instanceof T ? a.Da : null) {
    case "detect":
      return No.C();
    case "raw":
      return Bo.C();
    case "edn":
      return to.C();
    case "json":
      return Eo.e(b);
    case "transit":
      return xo.e(b);
    default:
      return null;
  }
}
var Qo = function() {
  function a(a, b) {
    var c = zd(a) ? S.a(oe, a) : a, h = R.a(c, bh), k = R.a(c, uh), l = R.a(c, Ph), m = Q.g(b, 0, null), c = Q.g(b, 1, null), k = t(m) ? l : k;
    t(k) && (k.e ? k.e(c) : k.call(null, c));
    return ld(h) ? h.C ? h.C() : h.call(null) : null;
  }
  function b(a) {
    var b = zd(a) ? S.a(oe, a) : a, c = R.a(b, bh), h = R.a(b, uh), k = R.a(b, Ph);
    return function(a, b, c, d, e) {
      return function(a) {
        var b = Q.g(a, 0, null);
        a = Q.g(a, 1, null);
        b = t(b) ? e : d;
        t(b) && (b.e ? b.e(a) : b.call(null, a));
        return ld(c) ? c.C ? c.C() : c.call(null) : null;
      };
    }(a, b, c, h, k);
  }
  var c = null, c = function(c, e) {
    switch(arguments.length) {
      case 1:
        return b.call(this, c);
      case 2:
        return a.call(this, c, e);
    }
    throw Error("Invalid arity: " + arguments.length);
  };
  c.e = b;
  c.a = a;
  return c;
}(), Ro = function() {
  function a(a, d) {
    var e = null;
    1 < arguments.length && (e = L(Array.prototype.slice.call(arguments, 1), 0));
    return b.call(this, a, e);
  }
  function b(a, b) {
    var e = G(b), e = e instanceof T ? S.a(oe, b) : e, e = jd.j(e, Ih, a, L([hh, "POST"], 0)), e = zd(e) ? S.a(oe, e) : e, f = R.a(e, nh), h = R.a(e, kh), k = R.a(e, ch), l = R.a(e, hh), f = !(qo(f) || C.a(l, "GET")), k = t(t(k) ? k : f) ? Oo(k, e) : null, e = jd.j(e, Ph, Qo.e(e), L([ch, k, kh, Po(h, e)], 0)), e = zd(e) ? S.a(oe, e) : e, h = R.a(e, xh), f = R.a(e, kh), k = R.a(e, hh);
    R.a(e, Ih);
    if (!sd(f)) {
      if (Bd(f)) {
        f = new s(null, 2, [fh, f, ah, "custom"], null);
      } else {
        throw Error("unrecognized response format: " + x.e(f));
      }
    }
    var k = Ho(k), m;
    var n = zd(e) ? S.a(oe, e) : e, l = R.a(n, th);
    m = R.a(n, nh);
    var p = R.a(n, ch), r = R.a(n, hh), n = R.a(n, Ih);
    if (C.a(Ho(r), "GET")) {
      p = W, n = t(m) ? "" + x.e(n) + "?" + x.e(yo(m)) : n, m = new U(null, 3, 5, p, [n, null, l], null);
    } else {
      var r = sd(p) ? p : Bd(p) ? new s(null, 2, [vh, p, Eh, "text/plain"], null) : null, v = zd(r) ? S.a(oe, r) : r, r = R.a(v, Eh), v = R.a(v, vh);
      if (null != v) {
        m = v.e ? v.e(m) : v.call(null, m);
      } else {
        if (!qo(m)) {
          throw Error("unrecognized request format: " + x.e(p));
        }
      }
      l = rg.j(L([t(l) ? l : wf, t(r) ? new s(null, 1, ["Content-Type", r], null) : null], 0));
      m = new U(null, 3, 5, W, [n, m, l], null);
    }
    l = Q.g(m, 0, null);
    n = Q.g(m, 1, null);
    m = Q.g(m, 2, null);
    p = zd(e) ? S.a(oe, e) : e;
    p = R.a(p, Ph);
    if (t(p)) {
      f = Io.a(f, p);
    } else {
      throw Error("No ajax handler provided.");
    }
    return oo(h, l, k, n, Sg(m), f, e);
  }
  a.D = 1;
  a.s = function(a) {
    var d = G(a);
    a = I(a);
    return b(d, a);
  };
  a.j = b;
  return a;
}();
var So = tj.call(null, "you need to make a greeter");
function To(a) {
  return Ro.call(null, "/hello_ajax/greet", new s(null, 1, [new T(null, "params", "params", 710516235), new FormData(a)], null));
}
function Uo() {
  return new U(null, 2, 5, W, [new T(null, "form", "form", -1624062471), new U(null, 4, 5, W, [new T(null, "p", "p", 151049309), "Please enter your name and hit the button: ", new U(null, 2, 5, W, [new T(null, "input", "input", 556931961), new s(null, 3, [new T(null, "type", "type", 1174270348), "text", new T(null, "value", "value", 305978217), "", new T(null, "name", "name", 1843675177), "name"], null)], null), new U(null, 2, 5, W, [new T(null, "button", "button", 1456579943), new s(null, 1, [new T(null, 
  "on-click", "on-click", 1632826543), function() {
    return To.call(null, document.Te("form"));
  }], null)], null)], null)], null);
}
function Vo() {
  return new U(null, 3, 5, W, [new T(null, "div", "div", 1057191632), new U(null, 1, 5, W, [Uo], null), new U(null, 2, 5, W, [new T(null, "h2", "h2", -372662728), M.call(null, So)], null)], null);
}
ca("helloajax.run", function() {
  return sj.call(null, new U(null, 1, 5, W, [Vo], null), document.getElementById("hello-ajax-container"));
});

})();
