const dns = require('dns');

// Force IPv4 lookup
dns.lookup('db.bijtealkyvehtwmwqfsk.supabase.co', { family: 4 }, (err, address, family) => {
    if (err) {
        console.error('IPv4 Lookup Error:', err.code);
    } else {
        console.log('IPv4 Address:', address);
    }
});
