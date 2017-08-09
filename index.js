/* jshint node: true */
'use strict';

module.exports = {
  name: 'simple-infinity',

  included: function(app) {
    this.addons.forEach(function(addon){
      if (addon.name === "ember-version-is") {
        addon.included.apply(addon, [app]);
      }
    });
  }
};
