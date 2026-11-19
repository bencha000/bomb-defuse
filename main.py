"""
Bomb Defuse Prototype - Windows Desktop 入口
用 pywebview 将 prototype/index.html 包装为桌面窗口，
PyInstaller 打包后得到单文件 exe。
"""
import os
import sys


def resource_path(rel):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


def main():
    import webview

    html_path = resource_path(os.path.join("prototype", "index.html"))
    url = "file:///" + html_path.replace("\\", "/")
    webview.create_window(
        title="Bomb Defuse Prototype",
        url=url,
        width=1280,
        height=800,
        min_size=(960, 600),
        resizable=True,
        text_select=False,
    )
    webview.start()


if __name__ == "__main__":
    main()
