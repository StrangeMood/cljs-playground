(defproject clojure-playground "0.0.1"
  :description "A simple example of ClojureScript"

  :dependencies [[org.clojure/clojure "1.6.0"]
                 [org.clojure/clojurescript "0.0-2371"]
                 [reagent "0.4.3"]]

  :plugins [[lein-cljsbuild "1.0.3"]]

  :cljsbuild

  {:builds [{:source-paths ["app/assets/javascripts"]
             :compiler
             {:preamble ["reagent/react.js"]
              :output-to "app/assets/javascripts/clojure-script.js"
              :optimizations :advanced
              :pretty-print true}}]})