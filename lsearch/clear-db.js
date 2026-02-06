const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bijtealkyvehtwmwqfsk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpanRlYWxreXZlaHR3bXdxZnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzU2NzQsImV4cCI6MjA4NTk1MTY3NH0.TOQZYBSv3lXumFpCA3-YCnoESUj7FwuETCoolAq_EZs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearDb() {
    console.log('Clearing commands table...');

    // Get count first
    const { count } = await supabase.from('commands').select('*', { count: 'exact', head: true });
    console.log(`Current items: ${count}`);

    // Delete all
    const { error } = await supabase
        .from('commands')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
        console.error('Error clearing DB:', error.message);
    } else {
        console.log('Database cleared successfully.');

        // Verify
        const { count: newCount } = await supabase.from('commands').select('*', { count: 'exact', head: true });
        console.log(`Remaining items: ${newCount}`);
    }
}

clearDb();
