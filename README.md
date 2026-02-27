# Maven Caching Proxy

A lightweight Node.js proxy for Maven repositories with local disk caching. It speeds up builds by caching artifacts locally and can aggregate multiple upstream repositories.

## Prerequisites

- [Node.js](https://nodejs.org/) (tested on v25.2.1)
- npm (comes with Node.js)

## Setup

1. **Clone the repository** (if applicable).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure the environment**:
   Create a `.env` file in the root directory (refer to `.env.example` if available).
   ```env
   PORT=8081
   CACHE_DIR=./cache
   UPSTREAMS=https://repo1.maven.org/maven2/,https://another-repo.com/repository/maven-releases/
   ```
   - `PORT`: The port the proxy will listen on (default: 8081).
   - `CACHE_DIR`: The local directory where artifacts will be saved (default: `./cache`).
   - `UPSTREAMS`: A comma-separated list of upstream Maven repository URLs.

## Usage

### Running the Server

Start the proxy server:
```bash
node server.js
```

The proxy will be available at `http://localhost:8081`.

### Configuring Maven

To use this proxy in your Maven project, add it as a mirror in your `~/.m2/settings.xml`:

```xml
<settings>
  <mirrors>
    <mirror>
      <id>local-maven-proxy</id>
      <name>Local Maven Caching Proxy</name>
      <url>http://localhost:8081</url>
      <mirrorOf>*</mirrorOf>
    </mirror>
  </mirrors>
</settings>
```

### Configuring Gradle (Clean Setup)

Simplify your `settings.gradle.kts` by using the local proxy for upstream repositories:

```kotlin
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)

    repositories {
        google()
        mavenCentral()

        // 👇 Use local proxy
        maven {
            url = uri(System.getenv("MAVEN_PROXY_URL") ?: "http://localhost:8081/")
            isAllowInsecureProtocol = true
        }

        maven { url = uri("https://jitpack.io") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://developer.huawei.com/repo/") }
        maven { url = uri("https://oss.sonatype.org/content/repositories/snapshots/") }
    }
}
```

### Set Proxy URL Environment Variable

Set the `MAVEN_PROXY_URL` environment variable:

**macOS / Linux:**
```bash
export MAVEN_PROXY_URL=http://localhost:8081/
```

**Windows:**
```powershell
setx MAVEN_PROXY_URL "http://localhost:8081/"
```

> [!TIP]
> Restart Android Studio after setting the environment variable to ensure it is picked up.

### Manual Testing

You can test if the proxy is working using `curl`:

```bash
curl -I http://localhost:8081/org/apache/maven/maven-core/3.8.1/maven-core-3.8.1.pom
```

The proxy will check each upstream repository for the artifact, cache it if found, and return it to you. Subsequent requests for the same artifact will be served directly from the local cache.

## Technical Notes

- Built with **Express 5**.
- Uses **Axios** for upstream requests.
- Implements a simple file-based cache in the specified `CACHE_DIR`.
# maven-proxy
