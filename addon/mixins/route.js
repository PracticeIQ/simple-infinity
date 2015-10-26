import Ember from 'ember';
import { emberDataVersionIs } from 'ember-version-is';

const keys = Object.keys || Ember.keys;
/**
  The Simple Infinity Route Mixin enables an application route to load
  records for the route `model` as triggered by the controller (or Infinity Loader
  component).

  @class RouteMixin
  @namespace EmberInfinity
  @module ember-infinity/mixins/route
  @extends Ember.Mixin
*/
export default Ember.Mixin.create({

  /**
    @private
    @property _perPage
    @type Integer
    @default 25
  */
  _perPage: 25,

  /**
    @private
    @property _extraParams
    @type Object
    @default {}
  */
  _extraParams: {},

  /**
    @private
    @property _boundParams
    @type Object
    @default {}
  */
  _boundParams: {},

  /**
    @private
    @property _loadingMore
    @type Boolean
    @default false
  */
  _loadingMore: false,

  /**
    @private
    @property _totalPages
    @type Integer
    @default 0
  */
 // _totalPages: 0,

  /**
   * How many items have been fetched thus far. This is the 'skip' count.
   *
   *  @private
   *  @property _totalItemCount
   *  @type Integer
   *  @default 0
   */
  _totalItemCount: 0,

  /**
   * The name of the total items parameter, ie. 'skip'.
   */
  totalItemParam: 'skip',

  /**
    @private
    @property _infinityModelName
    @type String
    @default null
  */
  _infinityModelName: null,

  /**
    @private
    @property _modelPath
    @type String
    @default 'controller.model'
  */
  _modelPath: 'controller.model',

  /**
   * Name of the "per page" param in the
   * resource request payload
   * @type {String}
   * @default  "take"
   */
  perPageParam: 'take',

  /**
   * The supported findMethod name for
   * the developers Ember Data version.
   * Provided here for backwards compat.
   * @type {String}
   * @default "query"
   */
  _storeFindMethod: 'query',

  /*
   * Instead of tracking total pages and current pages, we simply keep fetching until the
   * server returns no more items. Now this property can be the flag that says whether
   * we've fetched zero items or not. Defaulting to true ensures we always fetch at
   * least once.
   */
  _canLoadMore: true,

  /**
    Use the infinityModel method in the place of `this.store.find('model')` to
    initialize the Infinity Model for your route.

    @method infinityModel
    @param {String} modelName The name of the model.
    @param {Object} options Optional, the perPage and startingPage to load from.
    @param {Object} boundParams Optional, any route properties to be included as additional params.
    @return {Ember.RSVP.Promise}
  */
  infinityModel(modelName, options, boundParams) {

    if (emberDataVersionIs('greaterThan', '1.0.0-beta.19.2') && emberDataVersionIs('lessThan', '1.13.4')) {
      throw new Ember.Error("Ember Infinity: You are using an unsupported version of Ember Data.  Please upgrade to at least 1.13.4 or downgrade to 1.0.0-beta.19.2");
    }

    if (emberDataVersionIs('lessThan', '1.13.0')) {
      this.set('_storeFindMethod', 'find');
    }

    if (Ember.isEmpty(this.store) || Ember.isEmpty(this.store[this._storeFindMethod])){
      throw new Ember.Error("Ember Infinity: Ember Data store is not available to infinityModel");
    } else if (modelName === undefined) {
      throw new Ember.Error("Ember Infinity: You must pass a Model Name to infinityModel");
    }

    this.set('_infinityModelName', modelName);

    options = options ? Ember.merge({}, options) : {};
    var startingItem = options.startingItem === undefined ? 0 : options.startingItem;
    var perPage      = options.perPage || this.get('_perPage');
    var modelPath    = options.modelPath || this.get('_modelPath');

    delete options.startingItem;
    delete options.perPage;
    delete options.modelPath;

    this.set('_perPage', perPage);
    this.set('_modelPath', modelPath);
    this.set('_extraParams', options);

    var requestPayloadBase = {};
    requestPayloadBase[this.get('perPageParam')] = perPage;
    requestPayloadBase[this.get('totalItemParam')] = startingItem;

    if (typeof boundParams === 'object') {
      this.set('_boundParams', boundParams);
      options = this._includeBoundParams(options, boundParams);
    }

    var params = Ember.merge(requestPayloadBase, options);
    let promise = this.store[this._storeFindMethod](modelName, params);

    promise.then(
      infinityModel => {
        let count = infinityModel.get("length");

        if (count === 0) {
          this.set("_canLoadMore", false);
        }

        let currentCount = this.get("_totalItemCount");
        let newTotal = currentCount + count;
        this.set("_totalItemCount", newTotal);

        infinityModel.set('reachedInfinity', !this.get('_canLoadMore'));

        if(this.infinityModelUpdated) {
          Ember.run.scheduleOnce('afterRender', this, 'infinityModelUpdated', {
            lastItemLoaded: newTotal,
            newObjects: infinityModel
          });
        }
      },
      () => {
        throw new Ember.Error("Ember Infinity: Could not fetch Infinity Model. Please check your serverside configuration.");
      }
    );

    return promise;
  },

  /**
   Trigger a load of the next page of results.

   @method infinityLoad
   @return {Boolean}
   */
  _infinityLoad() {
    var nextItem    = this.get("_totalItemCount") + 1;
    var perPage     = this.get('_perPage');
    var modelName   = this.get('_infinityModelName');
    var options     = this.get('_extraParams');
    var boundParams = this.get('_boundParams');

    if (!this.get('_loadingMore') && this.get('_canLoadMore')) {
      this.set('_loadingMore', true);

      var requestPayloadBase = {};
      requestPayloadBase[this.get('perPageParam')] = perPage;
      requestPayloadBase[this.get('totalItemParam')] = nextItem;

      options = this._includeBoundParams(options, boundParams);
      var params = Ember.merge(requestPayloadBase, this.get('_extraParams'));

      let promise = this.store[this._storeFindMethod](modelName, params);

      promise.then(
        newObjects => {

          let count = newObjects.get("length");

          if (count === 0) {
            this.set("_canLoadMore", false);
          }

          let currentCount = this.get("_totalItemCount");
          let newTotal = currentCount + count;
          this.set("_totalItemCount", newTotal);


          this.updateInfinityModel(newObjects);
          this.set('_loadingMore', false);

          if(this.infinityModelUpdated) {
            Ember.run.scheduleOnce('afterRender', this, 'infinityModelUpdated', {
              lastItemLoaded: newTotal,
              newObjects: newObjects
            });
          }
          if (!this.get('_canLoadMore')) {
            this.set(this.get('_modelPath') + '.reachedInfinity', true);
            if(this.infinityModelLoaded) {
              Ember.run.scheduleOnce('afterRender', this, 'infinityModelLoaded', {
                totalItems: newTotal
              });
            }
          }
        },
        () => {
          this.set('_loadingMore', false);
          throw new Ember.Error("Ember Infinity: Could not fetch Infinity Model. Please check your serverside configuration.");
        }
      );
    } else {
      if (!this.get('_canLoadMore')) {
        this.set(this.get('_modelPath') + '.reachedInfinity', true);
        if(this.infinityModelLoaded) {
          Ember.run.scheduleOnce('afterRender', this, 'infinityModelLoaded', { totalItems: nextItem });
        }
      }
    }
    return false;
  },

  /**
   include any bound params into the options object.

   @method includeBoundParams
   @param {Object} options, the object to include bound params into.
   @param {Object} boundParams, an object of properties to be included into options.
   @return {Object}
   */
  _includeBoundParams: function(options, boundParams) {
    if (!Ember.isEmpty(boundParams)) {
      keys(boundParams).forEach(k => options[k] = this.get(boundParams[k]));
    }

    return options;
  },

  /**
   Update the infinity model with new objects

   @method updateInfinityModel
   @param {Ember.Enumerable} newObjects The new objects to add to the model
   @return {Ember.Array} returns the updated infinity model
   */
  updateInfinityModel(newObjects) {
    var infinityModel = this.get(this.get('_modelPath'));

    return infinityModel.pushObjects(newObjects.get('content'));
  },

  actions: {
    infinityLoad() {
      this._infinityLoad();
    }
  }
});
