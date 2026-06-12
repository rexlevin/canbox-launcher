<template>
    <Launcher />
</template>

<script setup>
import Launcher from './components/Launcher.vue';
</script>

<style>
/* 透明窗口背景（由 canbox 的 app.json transparent: true 配合） */
html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

#app {
    width: 100%;
    height: 100%;
}
</style>
