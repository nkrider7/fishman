use reqwest::Method;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let method = Method::from_bytes(b"QUERY")?;
    println!("parsed method as_str={}", method.as_str());

    let client = reqwest::Client::new();
    let resp = client
        .request(method, "http://127.0.0.1:3000/")
        .header("Content-Type", "application/json")
        .body(r#"{"search":"Fishman"}"#)
        .send()
        .await?;

    println!("status={}", resp.status());
    println!("body={}", resp.text().await?);
    Ok(())
}
