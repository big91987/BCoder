const axios = require('axios');

// 测试火山方舟豆包 API 连接
async function testVolcanoAPI() {
    const apiKey = 'e51c57a1-d4de-4572-8387-2a9dc93fff52';
    const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

    console.log('🧪 Testing Volcano API Connection...');
    console.log('📍 Endpoint:', endpoint);
    console.log('🔑 API Key:', apiKey.substring(0, 8) + '...');

    try {
        const response = await axios.post(endpoint, {
            model: 'doubao-1-5-vision-pro-32k-250115',
            messages: [
                {
                    role: 'user',
                    content: '你好，请简单回复一下'
                }
            ],
            max_tokens: 100,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('✅ API 连接成功!');
        console.log('📝 响应状态:', response.status);
        console.log('💬 AI 回复:', response.data.choices[0].message.content);
        console.log('📊 完整响应:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.log('❌ API 连接失败!');

        if (error.response) {
            console.log('📍 状态码:', error.response.status);
            console.log('📝 错误信息:', error.response.statusText);
            console.log('📊 响应数据:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.log('📡 网络错误:', error.message);
        } else {
            console.log('🔧 其他错误:', error.message);
        }
    }
}

// 测试不同的 endpoint 路径
async function testDifferentEndpoints() {
    const apiKey = 'e51c57a1-d4de-4572-8387-2a9dc93fff52';
    const endpoints = [
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        'https://ark.cn-beijing.volces.com/api/v3',
        'https://ark.cn-beijing.volces.com/api/v3/completions'
    ];

    for (const endpoint of endpoints) {
        console.log(`\n🧪 Testing endpoint: ${endpoint}`);

        try {
            const response = await axios.post(endpoint, {
                model: 'doubao-1-5-vision-pro-32k-250115',
                messages: [
                    {
                        role: 'user',
                        content: '测试'
                    }
                ],
                max_tokens: 50
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log(`✅ ${endpoint} - 成功!`);

        } catch (error) {
            if (error.response) {
                console.log(`❌ ${endpoint} - 失败: ${error.response.status} ${error.response.statusText}`);
            } else {
                console.log(`❌ ${endpoint} - 网络错误: ${error.message}`);
            }
        }
    }
}

// 运行测试
async function runTests() {
    console.log('🚀 开始 API 测试...\n');

    // 测试主要 API
    await testVolcanoAPI();

    console.log('\n' + '='.repeat(50));

    // 测试不同的 endpoint
    await testDifferentEndpoints();

    console.log('\n🏁 测试完成!');
}

runTests().catch(console.error);
