// Minimal test case
const errorHandler = {
  withErrorHandling: async (fn: Function, opts: any) => fn()
};

async function test() {
  const modules = await Promise.all([Promise.resolve(1), Promise.resolve(2)]);
  
  await errorHandler.withErrorHandling(async () => {
    console.log('test');
  }, {
    operation: 'test'
  });
}

test();