require('dotenv').config();

async function test() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.log("No API key");
    return;
  }
  const prompt = "hola";
  
  // Test 1: With response_format json_object
  try {
    const requestBodyJson = {
      model: 'minimaxai/minimax-m2.7',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      top_p: 0.95,
      max_tokens: 480,
      stream: false,
      response_format: { type: 'json_object' },
    };

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBodyJson),
    });

    console.log("Status with json_object:", response.status);
    console.log(await response.text());
  } catch (e) { console.error(e); }

  // Test 2: Without response_format json_object
  try {
    const requestBodyJson2 = {
      model: 'minimaxai/minimax-m2.7',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      top_p: 0.95,
      max_tokens: 480,
      stream: false,
    };

    const response2 = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBodyJson2),
    });

    console.log("Status without json_object:", response2.status);
    console.log(await response2.text());
  } catch (e) { console.error(e); }
}

test();
