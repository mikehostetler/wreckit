#!/usr/bin/env node

// Playwright test to verify circuit breaker metrics are being exported
const { chromium } = require('playwright');

async function testCircuitBreakerMetrics() {
  console.log('🚀 Testing Circuit Breaker Metrics with Playwright\n');
  
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Test 1: Verify Prometheus metrics endpoint is accessible
    console.log('📊 Testing Prometheus metrics endpoint...');
    const response = await page.goto('http://localhost:9568/metrics', { 
      waitUntil: 'networkidle', 
      timeout: 10000 
    });
    
    if (response.status() !== 200) {
      throw new Error(`Prometheus endpoint returned status ${response.status()}`);
    }
    console.log('✅ Prometheus endpoint is accessible');
    
    // Test 2: Get metrics content
    const metricsText = await page.textContent('body');
    console.log(`📈 Retrieved ${metricsText.length} characters of metrics data`);
    
    // Test 3: Verify circuit breaker metrics are present
    const circuitBreakerMetrics = [
      'cyb_circuit_breaker_state',
      'cyb_circuit_breaker_success_count',
      'cyb_circuit_breaker_failure_count',
      'cyb_circuit_breaker_health_score',
      'cyb_circuit_breaker_adaptive_threshold',
      'cybernetic_health_circuit_breakers_total_count',
      'cybernetic_alerts_circuit_breaker_count'
    ];
    
    console.log('\n🔍 Checking for circuit breaker metrics:');
    const foundMetrics = [];
    const missingMetrics = [];
    
    for (const metric of circuitBreakerMetrics) {
      if (metricsText.includes(metric)) {
        foundMetrics.push(metric);
        console.log(`✅ Found: ${metric}`);
      } else {
        missingMetrics.push(metric);
        console.log(`❌ Missing: ${metric}`);
      }
    }
    
    // Test 4: Verify provider-specific metrics
    console.log('\n🏥 Checking for provider-specific circuit breaker data:');
    const providers = ['anthropic', 'openai', 'together', 'ollama'];
    const providerMetrics = [];
    
    for (const provider of providers) {
      const providerPattern = `circuit_breaker="s4_provider_${provider}"`;
      if (metricsText.includes(providerPattern)) {
        providerMetrics.push(provider);
        console.log(`✅ Found metrics for provider: ${provider}`);
      } else {
        console.log(`❌ Missing metrics for provider: ${provider}`);
      }
    }
    
    // Test 5: Extract sample metric values
    console.log('\n📋 Sample circuit breaker metric values:');
    const healthScoreMatch = metricsText.match(/cyb_circuit_breaker_health_score{[^}]+} ([\d.]+)/);
    if (healthScoreMatch) {
      console.log(`🔹 Health Score: ${healthScoreMatch[1]}`);
    }
    
    const stateMatch = metricsText.match(/cyb_circuit_breaker_state{[^}]+} ([\d.]+)/);
    if (stateMatch) {
      const stateValue = parseFloat(stateMatch[1]);
      const stateText = stateValue === 0 ? 'closed' : stateValue === 1 ? 'open' : 'half_open';
      console.log(`🔹 Circuit State: ${stateText} (${stateValue})`);
    }
    
    const totalCountMatch = metricsText.match(/cybernetic_health_circuit_breakers_total_count ([\d.]+)/);
    if (totalCountMatch) {
      console.log(`🔹 Total Circuit Breakers: ${totalCountMatch[1]}`);
    }
    
    // Test 6: Verify telemetry metadata
    console.log('\n🏷️  Checking telemetry metadata:');
    const hasVersionInfo = metricsText.includes('cybernetic_info');
    const hasProcessInfo = metricsText.includes('vm_memory_total');
    
    console.log(`✅ Version info: ${hasVersionInfo ? 'Present' : 'Missing'}`);
    console.log(`✅ VM metrics: ${hasProcessInfo ? 'Present' : 'Missing'}`);
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`✅ Metrics endpoint accessible: Yes`);
    console.log(`✅ Circuit breaker metrics found: ${foundMetrics.length}/${circuitBreakerMetrics.length}`);
    console.log(`✅ Provider metrics found: ${providerMetrics.length}/${providers.length}`);
    console.log(`✅ Data size: ${(metricsText.length / 1024).toFixed(1)}KB`);
    
    if (foundMetrics.length >= 5 && providerMetrics.length >= 3) {
      console.log('\n🎉 SUCCESS: Circuit breaker monitoring system is working!');
      return true;
    } else {
      console.log('\n❌ FAILURE: Circuit breaker monitoring system has issues');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

// Run the test
(async () => {
  const success = await testCircuitBreakerMetrics();
  process.exit(success ? 0 : 1);
})();