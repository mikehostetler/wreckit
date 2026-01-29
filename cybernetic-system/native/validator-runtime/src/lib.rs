use serde::Deserialize;

#[derive(Deserialize)]
struct Message {
    headers: serde_json::Value,
    payload: serde_json::Value,
}

#[no_mangle]
pub extern "C" fn validate(input_ptr: *const u8, input_len: usize) -> i32 {
    let slice = unsafe { std::slice::from_raw_parts(input_ptr, input_len) };
    let s = match std::str::from_utf8(slice) {
        Ok(v) => v,
        Err(_) => return reject("bad-utf8"),
    };

    match serde_json::from_str::<Message>(s) {
        Ok(m) => {
            // Example policy: must include _nonce/_timestamp and sha256 signature
            let ok = m.headers.get("_nonce").is_some()
                && m.headers.get("_timestamp").is_some()
                && m.headers.get("_signature_alg").map(|a| a == "hmac-sha256").unwrap_or(false);

            if ok { print!("OK"); 0 } else { reject("missing-headers") }
        }
        Err(_) => reject("bad-json"),
    }
}

fn reject(reason: &str) -> i32 {
    print!("REJECT:{reason}");
    1
}