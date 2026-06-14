/**
 * 单元测试 - 验证 mermaid 修复引擎的核心功能
 */
import { MermaidFixEngine } from "./mermaidFixEngine.js";
const fixEngine = MermaidFixEngine.getInstance();
async function runTests() {
    console.log("🧪 开始运行 Mermaid 修复引擎测试...\n");
    // 测试 1: 有效代码直接通过
    console.log("📋 测试 1: 有效代码直接通过");
    const validCode = `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B`;
    const result1 = await fixEngine.submitInitialCode(validCode);
    console.log(`   结果:`, result1);
    console.log(`   ✅ 测试 1 ${result1.valid ? "通过" : "失败"}\n`);
    if (result1.requestId) {
        await fixEngine.cleanupSession(result1.requestId);
    }
    // 测试 2: 包含错误的代码，然后修复
    console.log("📋 测试 2: 包含错误的代码，然后修复");
    const invalidCode = `graph TD
    A[Start] --x B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B`;
    const result2 = await fixEngine.submitInitialCode(invalidCode);
    console.log(`   初始验证结果:`, result2);
    if (!result2.valid && result2.errors) {
        console.log(`   检测到错误，尝试修复...`);
        const fixResult = await fixEngine.submitFixes(result2.requestId, [
            {
                lineNumber: 2,
                content: "    A[Start] --> B{Is it working?}",
            },
        ]);
        console.log(`   修复结果:`, fixResult);
        console.log(`   ✅ 测试 2 ${fixResult.valid ? "通过" : "失败"}\n`);
        if (fixResult.valid) {
            const finalCode = await fixEngine.getFinalCode(result2.requestId);
            console.log(`   最终代码:`, finalCode);
        }
        await fixEngine.cleanupSession(result2.requestId);
    }
    else {
        console.log(`   ❌ 测试 2 失败: 没有检测到预期的错误\n`);
    }
    // 测试 3: 多次修复会话状态查询
    console.log("📋 测试 3: 多次修复会话状态查询");
    const test3Code = `graph TD
    A --> B
    B --> C
    C --> D
    D --> E`;
    const result3 = await fixEngine.submitInitialCode(test3Code);
    const session3 = await fixEngine.getSession(result3.requestId);
    console.log(`   会话状态:`, session3);
    console.log(`   ✅ 测试 3 ${session3 ? "通过" : "失败"}\n`);
    await fixEngine.cleanupSession(result3.requestId);
    console.log("🎉 测试完成！");
}
runTests().catch(console.error);
//# sourceMappingURL=mermaidFixEngine.test.js.map