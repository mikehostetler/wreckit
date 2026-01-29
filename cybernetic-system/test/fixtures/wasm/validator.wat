;; Simple WASM validator for testing
;; Validates that messages have required fields and valid signatures

(module
  ;; Memory for string operations
  (memory (export "memory") 1)
  
  ;; Error codes
  (global $ERROR_INVALID_JSON i32 (i32.const 1))
  (global $ERROR_MISSING_FIELD i32 (i32.const 2))
  (global $ERROR_INVALID_SIGNATURE i32 (i32.const 3))
  (global $ERROR_EXPIRED i32 (i32.const 4))
  (global $ERROR_INVALID_NONCE i32 (i32.const 5))
  
  ;; Host imports
  (import "env" "host_time_ms" (func $host_time_ms (result i64)))
  (import "env" "host_log" (func $host_log (param i32 i32) (result i32)))
  
  ;; Main validation function
  ;; Returns 0 for valid, error code for invalid
  (func $validate (export "validate") (param $json_ptr i32) (param $json_len i32) (result i32)
    (local $result i32)
    
    ;; Basic length check
    (if (i32.lt_u (local.get $json_len) (i32.const 10))
      (then 
        (return (global.get $ERROR_INVALID_JSON))
      )
    )
    
    ;; Check for required fields (simplified - just checks for '{' and '}')
    (if (i32.ne 
          (i32.load8_u (local.get $json_ptr))
          (i32.const 123))  ;; ASCII '{'
      (then 
        (return (global.get $ERROR_INVALID_JSON))
      )
    )
    
    ;; Check timestamp (simplified - would parse JSON in real implementation)
    (if (i64.gt_u 
          (i64.sub (call $host_time_ms) (i64.const 1000000))
          (i64.const 300000))  ;; 5 minute window
      (then
        ;; Log the validation attempt
        (call $host_log 
          (i32.const 0x696E666F)  ;; "info" 
          (i32.const 0x56616C6964))  ;; "Valid"
        (return (i32.const 0))  ;; Valid
      )
      (else
        (return (global.get $ERROR_EXPIRED))
      )
    )
  )
  
  ;; Get error message for a given error code
  (func $get_error_message (export "get_error_message") (param $code i32) (result i32 i32)
    ;; Return pointer and length to error string
    ;; In real implementation, would return actual string from memory
    (i32.const 0)  ;; ptr
    (i32.const 20) ;; len
  )
)