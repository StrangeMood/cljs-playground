(ns joppa
  (:require [reagent.core :as reagent :refer [atom]]))

(defn greetings-input [value]
  [:input {:type "text"
           :value @value
           :on-change #(reset! value (-> % .-target .-value))}])

(defn main-component []
  (let [greeting (atom "Joppa Driller")]
    (fn []
      [:div [:h1 @greeting]
       [greetings-input greeting]])))

(reagent/render-component
  [main-component]
  (.getElementById js/document "hello-world-container"))

