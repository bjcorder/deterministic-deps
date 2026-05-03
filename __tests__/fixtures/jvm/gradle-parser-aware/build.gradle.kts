dependencies {
  /* implementation("com.example:commented:latest.release") */
  implementation("com.example:kotlin:[1.0,2.0)")
  runtimeOnly(group = "com.example", name = "mapped", version = "+")
}

plugins {
  id("com.example.kotlin-plugin") version "latest.integration"
}

val unrelated = "com.example:ignored:+"
