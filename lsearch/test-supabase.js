// Test script to verify configuration
require('dotenv').config({ path: '.env.local' });

console.log('=== Configuration Check ===\n');

console.log('1. SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING');
console.log('2. SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?
    `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 30)}...` : 'MISSING');
console.log('3. NOTEBOOK_ID:', process.env.NOTEBOOKLM_NOTEBOOK_ID || 'MISSING');

console.log('\n=== Testing Supabase Connection ===\n');

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
    try {
        // Test 1: Check connection
        const { data, error } = await supabase.from('commands').select('count');

        if (error) {
            console.error('❌ Supabase Error:', error.message);
            console.log('\n💡 Fix:');
            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                console.log('   - Go to https://supabase.com/dashboard/project/bijtealkyvehtwmwqfsk/editor');
                console.log('   - Run the SQL from src/lib/schema.sql');
            } else if (error.message.includes('API key')) {
                console.log('   - Check that NEXT_PUBLIC_SUPABASE_ANON_KEY is correct');
            }
        } else {
            console.log('✅ Supabase connection successful!');
            console.log(`   Commands in database: ${data ? data.length : 0}`);
        }

        // Test 2: Try to insert a test command
        const { error: insertError } = await supabase.from('commands').insert({
            command: 'test-diagnostic',
            description: 'Diagnostic test command',
            category: 'system',
            tags: ['test']
        });

        if (insertError) {
            console.error('\n❌ Insert test failed:', insertError.message);
        } else {
            console.log('✅ Insert test successful!');

            // Clean up
            await supabase.from('commands').delete().eq('command', 'test-diagnostic');
            console.log('✅ Cleanup successful!');
        }

    } catch (err) {
        console.error('❌ Test failed:', err.message);
    }
}

test();
