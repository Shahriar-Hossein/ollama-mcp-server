pub struct Router {
    pub enabled: bool,
}

impl Router {
    pub fn dispatch(&self, kind: &str) -> &'static str {
        if self.enabled && kind == "report" {
            "ready"
        } else {
            "idle"
        }
    }
}

pub fn invoke(router: &Router, kind: &str) -> &'static str {
    router.dispatch(kind)
}
