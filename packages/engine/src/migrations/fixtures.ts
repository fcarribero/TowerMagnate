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
