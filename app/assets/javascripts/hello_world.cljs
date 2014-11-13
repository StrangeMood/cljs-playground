(ns joppa
  (:require [reagent.core :as reagent :refer [atom]]))

(def greeting (atom "Joppa Driller"))

(defn greetings-input [value]
  [:input {:type "text"
           :value @value
           :on-change #(reset! value (-> % .-target .-value))}])

(defn main-component []
  [:div
   [:h1 @greeting]
   [greetings-input greeting]])

(reagent/render-component
  [main-component]
  (.getElementById js/document "hello-world-container"))

