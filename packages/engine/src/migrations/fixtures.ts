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
  '"units":{},"people":{"nextId":4,"id":[1,3],"kind":[0,2],"homeUnit":[0,0],' +
  '"level":[1,5],"column":[10,40],"trip":[0,0],"dueStep":[8700,-1],"stress":[0,12.5],' +
  '"nameSeed":[77,91],"followed":[3]}}';
