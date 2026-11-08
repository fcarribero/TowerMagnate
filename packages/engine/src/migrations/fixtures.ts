/** Saves written by older engines. Never edit one; add a new fixture with each schema version. */
export const VERSION_1_SAVE =
  '{"schemaVersion":1,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":2,' +
  '"units":{"u1":{"id":"u1","type":"office","x":10,"level":1,"name":"Sur"}}}';

export const VERSION_2_SAVE =
  '{"schemaVersion":2,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":2,' +
  '"units":{"u1":{"id":"u1","type":"office","x":10,"level":2,"name":"Sur",' +
  '"priceLevel":"normal","paid":44500,"placedAtStep":120}}}';

export const VERSION_3_SAVE =
  '{"schemaVersion":3,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":2,' +
  '"units":{"u1":{"id":"u1","type":"office","x":10,"level":2,"name":"Sur",' +
  '"priceLevel":"high","paid":44500,"placedAtStep":120,"used":true,' +
  '"lease":{"anchorStep":240,"nextDueStep":60720}}}}';

export const VERSION_4_SAVE =
  '{"schemaVersion":4,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":3,' +
  '"units":{"u1":{"id":"u1","type":"office","x":10,"level":2,"name":"Sur",' +
  '"priceLevel":"normal","paid":44500,"placedAtStep":120,"used":false,"lease":null}},' +
  '"shafts":{"s2":{"id":"s2","type":"standard","x":30,"bottom":1,"top":5,' +
  '"cars":[{"homeLevel":1,"level":3,"riders":["p7"],"paid":80000,"placedAtStep":200}],' +
  '"paid":200000,"placedAtStep":200}}}';

export const VERSION_5_SAVE =
  '{"schemaVersion":5,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":3,' +
  '"units":{},"shafts":{},"transports":{"t2":{"id":"t2","type":"escalator","x":20,"level":2}}}';

export const VERSION_6_SAVE =
  '{"schemaVersion":6,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":3,' +
  '"units":{},"shafts":{"s2":{"id":"s2","type":"standard","x":30,"bottom":1,"top":5,' +
  '"cars":[{"homeLevel":1,"level":1,"riders":[],"paid":80000,"placedAtStep":200}],' +
  '"paid":200000,"placedAtStep":200}},"transports":{},"activeEvents":[],' +
  '"closedDecisions":[],"treasureLevels":[]}';

export const VERSION_7_SAVE =
  '{"schemaVersion":7,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":2,' +
  '"units":{},"shafts":{},"people":{"nextId":4,"id":[1,3],"kind":[0,2],"homeUnit":[0,0],' +
  '"level":[1,5],"column":[10,40],"trip":[0,0],"dueStep":[8700,-1],"stress":[0,12.5],' +
  '"nameSeed":[77,91],"followed":[3]}}';

export const VERSION_8_SAVE =
  '{"schemaVersion":8,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":2,"stars":3,' +
  '"units":{},"shafts":{},"people":{"nextId":4,"id":[1,3],"kind":[0,2],"homeUnit":[0,0],' +
  '"level":[1,5],"column":[10,40],"trip":[0,0],"dueStep":[8700,-1],"stress":[0,12.5],' +
  '"nameSeed":[77,91],"followed":[3]}}';

export const VERSION_9_SAVE =
  '{"schemaVersion":9,"step":8640,"rng":{"a":1,"b":2,"c":3,"d":4},"nextId":4,"stars":1,' +
  '"units":{"u1":{"id":"u1","type":"office","x":10,"level":2,"name":null,' +
  '"priceLevel":"normal","paid":44500,"placedAtStep":120,"used":false,"lease":null},' +
  '"u3":{"id":"u3","type":"suite","x":20,"level":3,"name":null,' +
  '"priceLevel":"high","paid":60000,"placedAtStep":300,"used":true,"lease":null}},' +
  '"shafts":{},"transports":{},"activeEvents":[],"closedDecisions":[],"treasureLevels":[],' +
  '"people":{"nextId":1,"id":[],"kind":[],"homeUnit":[],"level":[],"column":[],"trip":[],' +
  '"dueStep":[],"stress":[],"nameSeed":[],"followed":[]}}';
