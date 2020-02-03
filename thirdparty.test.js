const { bundleModule } = require("./thirdparty");

test('should bundle lodash', async() => {
  const r = await bundleModule("lodash");
  expect(r).not.toBeNull();
});

test('should bundle lodash minify', async() => {
  const r = await bundleModule("lodash", true);
  expect(r).not.toBeNull();
});