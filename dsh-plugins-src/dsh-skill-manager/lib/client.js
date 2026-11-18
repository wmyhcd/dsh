window.__ModuleLoader__.load({
  id: "dsh-skill-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var API = "/api/skill-manager";

    var CSS = [
      ".dsh-sm-root{display:flex;flex-direction:column;gap:10px;width:100%}",
      ".dsh-sm-head{display:flex;align-items:center;gap:8px}",
      ".dsh-sm-title{flex:1;font-size:13px;font-weight:500}",
      ".dsh-sm-count{font-size:11px;opacity:.55;font-variant-numeric:tabular-nums}",
      ".dsh-sm-btn{font-size:11px;padding:3px 9px;border-radius:6px;border:1px solid var(--dsh-color-border,rgba(128,128,128,.28));background:transparent;color:inherit;cursor:pointer;line-height:1.6}",
      ".dsh-sm-btn:hover{background:rgba(128,128,128,.12)}",
      ".dsh-sm-btn[disabled]{opacity:.45;cursor:default}",
      ".dsh-sm-list{display:flex;flex-direction:column;gap:6px;max-height:420px;overflow:auto}",
      ".dsh-sm-item{display:flex;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(128,128,128,.07);align-items:flex-start}",
      ".dsh-sm-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
      ".dsh-sm-name{font-size:12.5px;font-weight:500;word-break:break-all}",
      ".dsh-sm-desc{font-size:11.5px;opacity:.62;line-height:1.5;word-break:break-word}",
      ".dsh-sm-meta{font-size:10.5px;opacity:.42;font-variant-numeric:tabular-nums}",
      ".dsh-sm-switches{display:flex;flex-direction:column;gap:4px;flex:0 0 auto}",
      ".dsh-sm-sw{display:flex;align-items:center;gap:5px;font-size:10.5px;opacity:.75;cursor:pointer;user-select:none;white-space:nowrap}",
      ".dsh-sm-sw input{cursor:pointer;margin:0}",
      ".dsh-sm-sw[data-off]{opacity:.4}",
      ".dsh-sm-empty{font-size:11.5px;opacity:.55;line-height:1.7;padding:6px 0}",
      ".dsh-sm-roots{font-size:10.5px;opacity:.42;line-height:1.7;word-break:break-all}",
      ".dsh-sm-err{font-size:11.5px;color:#e5484d;line-height:1.6}",
      ".dsh-sm-tag{font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(128,128,128,.16);opacity:.8}",
    ].join("");

    var injected = false;
    function installStyles() {
      if (injected) return function () {};
      var el = document.createElement("style");
      el.setAttribute("data-dsh-skill-manager", "");
      el.textContent = CSS;
      document.head.appendChild(el);
      injected = true;
      return function () {
        el.remove();
        injected = false;
      };
    }

    function getJson(url, options) {
      return fetch(url, Object.assign({ credentials: "same-origin" }, options || {})).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }

    function SkillManagerRow() {
      var openState = React.useState(false);
      var open = openState[0];
      var setOpen = openState[1];

      var dataState = React.useState(null);
      var data = dataState[0];
      var setData = dataState[1];

      var errState = React.useState("");
      var error = errState[0];
      var setError = errState[1];

      var busyState = React.useState("");
      var busy = busyState[0];
      var setBusy = busyState[1];

      var load = React.useCallback(function () {
        setError("");
        getJson(API + "/list")
          .then(setData)
          .catch(function (e) {
            setError("读取失败：" + e.message);
          });
      }, []);

      React.useEffect(function () {
        if (open && !data) load();
      }, [open, data, load]);

      function toggle(skill, field, next) {
        var key = skill.name + ":" + field;
        setBusy(key);
        getJson(API + "/toggle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: skill.name, field: field, enabled: next }),
        })
          .then(load)
          .catch(function (e) {
            setError("保存失败：" + e.message);
          })
          .then(function () {
            setBusy("");
          });
      }

      var skills = (data && data.skills) || [];
      var roots = (data && data.roots) || [];

      var head = React.createElement(
        "div",
        { className: "dsh-sm-head" },
        React.createElement("div", { className: "dsh-sm-title" }, "Skill 管理"),
        data ? React.createElement("span", { className: "dsh-sm-count" }, skills.length + " 个") : null,
        React.createElement(
          "button",
          {
            type: "button",
            className: "dsh-sm-btn",
            onClick: function () {
              if (!open) {
                setOpen(true);
                load();
              } else {
                load();
              }
            },
          },
          open ? "刷新" : "管理",
        ),
        open
          ? React.createElement(
              "button",
              {
                type: "button",
                className: "dsh-sm-btn",
                onClick: function () {
                  setOpen(false);
                },
              },
              "收起",
            )
          : null,
      );

      if (!open) return React.createElement("div", { className: "dsh-sm-root" }, head);

      var body = [];
      if (error) body.push(React.createElement("div", { key: "err", className: "dsh-sm-err" }, error));

      if (!data) {
        body.push(React.createElement("div", { key: "loading", className: "dsh-sm-empty" }, "读取中…"));
      } else if (skills.length === 0) {
        body.push(
          React.createElement(
            "div",
            { key: "empty", className: "dsh-sm-empty" },
            "还没有任何 skill。把 <名字>/SKILL.md 或 <名字>.md 放进下面任意一个目录就会出现：",
            React.createElement(
              "div",
              { className: "dsh-sm-roots" },
              roots.map(function (r) {
                return React.createElement(
                  "div",
                  { key: r.source + r.dir },
                  (r.exists ? "✓ " : "· ") + r.dir,
                );
              }),
            ),
          ),
        );
      } else {
        body.push(
          React.createElement(
            "div",
            { key: "list", className: "dsh-sm-list" },
            skills.map(function (s) {
              var modelOn = !s.modelOff;
              var userOn = !s.userOff;
              return React.createElement(
                "div",
                { key: s.name, className: "dsh-sm-item" },
                React.createElement(
                  "div",
                  { className: "dsh-sm-main" },
                  React.createElement(
                    "div",
                    { className: "dsh-sm-name" },
                    s.name,
                    " ",
                    React.createElement("span", { className: "dsh-sm-tag" }, s.source),
                  ),
                  s.description
                    ? React.createElement("div", { className: "dsh-sm-desc" }, s.description)
                    : null,
                  React.createElement("div", { className: "dsh-sm-meta" }, s.file),
                ),
                React.createElement(
                  "div",
                  { className: "dsh-sm-switches" },
                  React.createElement(
                    "label",
                    { className: "dsh-sm-sw", "data-off": modelOn ? undefined : "1" },
                    React.createElement("input", {
                      type: "checkbox",
                      checked: modelOn,
                      disabled: busy === s.name + ":model",
                      onChange: function (e) {
                        toggle(s, "model", e.target.checked);
                      },
                    }),
                    "模型可用",
                  ),
                  React.createElement(
                    "label",
                    { className: "dsh-sm-sw", "data-off": userOn ? undefined : "1" },
                    React.createElement("input", {
                      type: "checkbox",
                      checked: userOn,
                      disabled: busy === s.name + ":user",
                      onChange: function (e) {
                        toggle(s, "user", e.target.checked);
                      },
                    }),
                    "菜单可见",
                  ),
                ),
              );
            }),
          ),
        );
      }

      return React.createElement("div", { className: "dsh-sm-root" }, head, body);
    }

    function apply(ctx) {
      ctx.effect(installStyles, "skill-manager: styles");
      ctx.slots.inject("settings.general.item", function () {
        return ctx.slots.register(
          {
            name: "settings.general.item",
            id: "skill-manager",
            order: 62,
          },
          SkillManagerRow,
        );
      });
    }

    module.exports = { apply: apply, inject: ["slots"] };
    return module.exports;
  },
});
